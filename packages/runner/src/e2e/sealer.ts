import { ENC_VERSION, open, runnerRecipientId, seal, type Recipient } from "@rosterdesk/protocol";

type Frame = { v: 2; id: string; type: string; ts: number; data: Record<string, unknown> };

/**
 * RD-601: PC → 폰으로 나가는 내용(답변·스트리밍 조각·승인 요약·입력 미리보기)을 사용자의 폰 기기마다 열 수 있는 봉투로 감싼다.
 * Hub는 봉투만 본다. 기기 목록은 Hub가 devices.sync로 준다 (v1 위협 모델: Hub가 키를 바꿔 끼우는 공격은 막지 못함, docs/architecture).
 */
export function createSealer(keys: { boxPub: string; boxSecret: Uint8Array }, runnerId: () => string | null) {
  let devices: Recipient[] = [];
  const sender = { pub: keys.boxPub, secret: keys.boxSecret };

  function wrap(text: string) {
    return seal(text, devices, sender);
  }

  return {
    setDevices(list: { deviceId: string; boxPub: string }[]) {
      devices = list.map((row) => ({ id: row.deviceId, pub: row.boxPub }));
    },
    deviceCount: () => devices.length,
    /** 기기를 아직 모르면(동기화 전) 그대로 둔다. */
    outgoing(frame: Frame): Frame {
      if (devices.length === 0) return frame;
      if (frame.type === "message.delta" || frame.type === "message.final") {
        const sealed = wrap(String(frame.data.text ?? ""));
        return sealed ? { ...frame, data: { ...frame.data, text: sealed, encVersion: ENC_VERSION } } : frame;
      }
      if (frame.type === "approval.request") {
        const summary = wrap(String(frame.data.summary ?? ""));
        const inputPreview = wrap(String(frame.data.inputPreview ?? ""));
        if (!summary || !inputPreview) return frame;
        return { ...frame, data: { ...frame.data, summary, inputPreview, encVersion: ENC_VERSION } };
      }
      return frame;
    },
    /** 폰이 암호화해 보낸 지시를 연다. 사용자의 기기가 보낸 봉투만 믿는다. 못 열면 null. */
    openTurnText(text: string, encVersion: number | undefined) {
      if (encVersion !== ENC_VERSION) return text;
      const id = runnerId();
      if (!id) return null;
      return open(text, { id: runnerRecipientId(id), secret: keys.boxSecret }, devices.map((row) => row.pub));
    },
  };
}
