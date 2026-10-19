import readline from "node:readline";
import type { Readable, Writable } from "node:stream";

export type ApprovalAsk = {
  requestId: string;
  toolName: string;
  input: Record<string, unknown>;
  summary: string;
};

export type Turn = { turnId: string; sessionKey: string; text: string };

export type TurnIO = {
  status(label: string): void;
  delta(text: string): void;
  tool(event: { toolName: string; phase: "started" | "finished" | "failed"; summary: string }): void;
  requestApproval(ask: ApprovalAsk): Promise<"approved" | "denied">;
  final(text: string): void;
  fail(code: string, message: string): void;
};

type Streams = { input?: Readable; output?: Writable };

export function createAgent(
  options: {
    name: string;
    capabilities: string[];
    onTurn: (turn: Turn, io: TurnIO) => Promise<void>;
  },
  streams: Streams = {},
) {
  const input = streams.input ?? process.stdin;
  const output = streams.output ?? process.stdout;
  const pending = new Map<string, (decision: "approved" | "denied") => void>();
  let turnId = "";

  const send = (value: unknown) => {
    output.write(`${JSON.stringify(value)}\n`);
  };
  const io = turnIO(send, () => turnId, pending);
  const lines = readline.createInterface({ input });
  lines.on("line", (line) => handleLine(line, options, send, io, pending, (id) => {
    turnId = id;
  }));
}

function turnIO(
  send: (value: unknown) => void,
  current: () => string,
  pending: Map<string, (decision: "approved" | "denied") => void>,
): TurnIO {
  return {
    status(label) {
      send({ type: "status", turnId: current(), label });
    },
    delta(text) {
      send({ type: "delta", turnId: current(), text });
    },
    tool(event) {
      send({ type: "tool", turnId: current(), ...event });
    },
    requestApproval(ask) {
      send({ type: "approval.request", turnId: current(), ...ask });
      return new Promise((resolve) => pending.set(ask.requestId, resolve));
    },
    final(text) {
      send({ type: "final", turnId: current(), text });
    },
    fail(code, message) {
      send({ type: "error", turnId: current(), code, message });
    },
  };
}

function handleLine(
  line: string,
  options: { name: string; capabilities: string[]; onTurn: (turn: Turn, io: TurnIO) => Promise<void> },
  send: (value: unknown) => void,
  io: TurnIO,
  pending: Map<string, (decision: "approved" | "denied") => void>,
  setTurn: (id: string) => void,
) {
  const msg = parse(line);
  if (!msg) return;
  if (msg.type === "hello") {
    send({ type: "ready", name: options.name, capabilities: options.capabilities });
    return;
  }
  if (msg.type === "turn") {
    setTurn(String(msg.turnId ?? ""));
    void options.onTurn(
      { turnId: String(msg.turnId), sessionKey: String(msg.sessionKey), text: String(msg.text) },
      io,
    );
    return;
  }
  if (msg.type === "approval.result") pending.get(String(msg.requestId))?.(msg.decision === "denied" ? "denied" : "approved");
  if (msg.type === "cancel") send({ type: "error", turnId: String(msg.turnId ?? ""), code: "cancelled", message: "취소됐어요" });
}

function parse(line: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(line) as unknown;
    if (!value || typeof value !== "object") return null;
    return value as Record<string, unknown>;
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : "bad json"}\n`);
    return null;
  }
}
