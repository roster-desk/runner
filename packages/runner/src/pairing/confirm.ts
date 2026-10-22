import { randomUUID } from "node:crypto";
import { computeSas, formatSas } from "@rosterdesk/protocol";

const CONFIRM_MS = 2 * 60 * 1000;

export type RunnerPubs = {
  signPublicKey: Uint8Array;
  boxPublicKey: Uint8Array;
};

export type ConfirmView = {
  kind: "ask" | "expired";
  lines: string[];
  displayName: string;
  sas: string;
  sessionId: string;
};

type Pending = ConfirmView & { expiresAt: number };

type HubConfirm = {
  type?: string;
  sessionId?: string;
  phoneBoxPub?: string;
  claimer?: { displayName?: string };
  data?: {
    sessionId?: string;
    phoneBoxPub?: string;
    claimer?: { displayName?: string };
  };
};

function readConfirm(message: HubConfirm) {
  const body = message.data ?? message;
  return {
    sessionId: body.sessionId ?? "",
    displayName: body.claimer?.displayName ?? "",
    phoneBoxPub: body.phoneBoxPub ?? "",
  };
}

export function sasLabel(input: {
  sessionId: string;
  phoneBoxPub: string;
  keys: RunnerPubs;
}) {
  const phoneBoxPub = new Uint8Array(Buffer.from(input.phoneBoxPub, "base64url"));
  return formatSas(
    computeSas({
      sessionId: input.sessionId,
      runnerSignPub: input.keys.signPublicKey,
      runnerBoxPub: input.keys.boxPublicKey,
      phoneBoxPub,
    }),
  );
}

function askLines(displayName: string, sas: string) {
  return [`${displayName} 님이 연결하려고 해요`, `대조 번호 ${sas}`, "허용하려면 y"];
}

export function createConfirmController(options: {
  keys: RunnerPubs;
  send: (message: unknown) => void;
  now?: () => number;
  onShow?: (view: ConfirmView) => void;
}) {
  const now = options.now ?? (() => Date.now());
  let pending: Pending | null = null;

  function showExpired(current: Pending): ConfirmView {
    pending = null;
    const view: ConfirmView = {
      kind: "expired",
      displayName: current.displayName,
      sas: current.sas,
      sessionId: current.sessionId,
      lines: ["시간이 지나 연결 요청이 만료됐어요"],
    };
    options.onShow?.(view);
    return view;
  }

  function sendDecision(decision: "allow" | "reject") {
    if (!pending) return null;
    if (now() >= pending.expiresAt) return showExpired(pending);
    const sessionId = pending.sessionId;
    pending = null;
    options.send({
      v: 2,
      id: randomUUID(),
      type: "pair.decision",
      ts: now(),
      data: { sessionId, decision },
    });
    return decision;
  }

  return {
    onHubMessage(message: HubConfirm) {
      if (message.type !== "pair.confirm_request") return null;
      const fields = readConfirm(message);
      const sas = sasLabel({ ...fields, keys: options.keys });
      pending = {
        kind: "ask",
        sessionId: fields.sessionId,
        displayName: fields.displayName,
        sas,
        expiresAt: now() + CONFIRM_MS,
        lines: askLines(fields.displayName, sas),
      };
      options.onShow?.(pending);
      return pending;
    },
    onTerminalLine(line: string) {
      const key = line.trim().toLowerCase();
      if (!pending) return "idle" as const;
      if (now() >= pending.expiresAt) return showExpired(pending).kind;
      if (key === "y") return sendDecision("allow");
      if (key === "n") return sendDecision("reject");
      return "wait" as const;
    },
    expire() {
      if (!pending || now() < pending.expiresAt) return null;
      return showExpired(pending);
    },
  };
}
