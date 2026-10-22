import nacl from "tweetnacl";
import { describe, expect, it } from "vitest";
import { open, runnerRecipientId, seal, toB64 } from "@rosterdesk/protocol";
import { createSealer } from "./sealer.js";

const pair = () => {
  const keys = nacl.box.keyPair();
  return { pub: toB64(keys.publicKey), secret: keys.secretKey };
};
const frame = (type: string, data: Record<string, unknown>) => ({ v: 2 as const, id: "f", type, ts: 0, data });

describe("runner e2e", () => {
  it("seals answers and approvals for every phone, leaves tool names in the clear", () => {
    const pc = pair();
    const phone = pair();
    const sealer = createSealer({ boxPub: pc.pub, boxSecret: pc.secret }, () => "r1");
    expect(sealer.outgoing(frame("message.final", { text: "평문" })).data.text).toBe("평문");
    sealer.setDevices([{ deviceId: "d1", boxPub: phone.pub }]);
    const final = sealer.outgoing(frame("message.final", { text: "리포트 결과", kind: "text" }));
    expect(final.data.encVersion).toBe(1);
    expect(String(final.data.text)).not.toContain("리포트");
    expect(open(String(final.data.text), { id: "d1", secret: phone.secret }, [pc.pub])).toBe("리포트 결과");
    const approval = sealer.outgoing(frame("approval.request", { toolName: "send_email", risk: "medium", summary: "팀에 메일", inputPreview: '{"to":"a"}' }));
    expect(approval.data.toolName).toBe("send_email");
    expect(open(String(approval.data.summary), { id: "d1", secret: phone.secret })).toBe("팀에 메일");
    expect(sealer.outgoing(frame("turn.status", { state: "done" })).data).toEqual({ state: "done" });
  });

  it("opens a phone's sealed instruction and refuses one from an unknown key", () => {
    const pc = pair();
    const phone = pair();
    const stranger = pair();
    const sealer = createSealer({ boxPub: pc.pub, boxSecret: pc.secret }, () => "r1");
    sealer.setDevices([{ deviceId: "d1", boxPub: phone.pub }]);
    const to = [{ id: runnerRecipientId("r1"), pub: pc.pub }];
    expect(sealer.openTurnText(seal("오늘 리포트", to, phone)!, 1)).toBe("오늘 리포트");
    expect(sealer.openTurnText(seal("가짜", to, stranger)!, 1)).toBeNull();
    expect(sealer.openTurnText("평문", undefined)).toBe("평문");
  });
});
