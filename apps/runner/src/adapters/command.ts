import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { JsonlFromAgent } from "@rosterdesk/protocol";
import { redactText } from "../redact/redact.js";
import type { AdapterAgent } from "./registry.js";
import type { AgentAdapter, TurnContext } from "./types.js";

type Deps = {
  spawnProcess?: typeof spawn;
  readyMs?: number;
  cancelMs?: number;
  log?: (line: string) => void;
};

export function createCommandAdapter(agent: AdapterAgent, deps: Deps = {}): AgentAdapter {
  const session = openSession(agent, deps);
  return {
    descriptor: {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      adapterKind: "command",
      capabilities: agent.capabilities,
    },
    health: () => session.health(),
    runTurn: (text, ctx) => session.turn(text, ctx),
    dispose: () => session.dispose(),
  };
}

type TurnWait = { ctx: TurnContext; finish: () => void; cancelTimer?: NodeJS.Timeout };

function openSession(agent: AdapterAgent, deps: Deps) {
  const readyMs = deps.readyMs ?? 10_000;
  const cancelMs = deps.cancelMs ?? 5_000;
  const log = deps.log ?? ((line) => console.error(`[runner] ${line}`));
  const launch = deps.spawnProcess ?? spawn;
  let child: ChildProcess | null = null;
  let buffer = "";
  let ready: ((ok: boolean) => void) | null = null;
  let turn: TurnWait | null = null;

  function write(value: unknown) {
    child?.stdin?.write(`${JSON.stringify(value)}\n`);
  }

  function finishTurn() {
    const current = turn;
    if (!current) return;
    if (current.cancelTimer) clearTimeout(current.cancelTimer);
    turn = null;
    current.finish();
  }

  function failTurn(code: string, message: string) {
    turn?.ctx.emit({ type: "error", code, message });
    finishTurn();
  }

  function handle(line: string) {
    const parsed = parseLine(line, log);
    if (!parsed) return;
    if (parsed.type === "ready") {
      ready?.(true);
      ready = null;
      return;
    }
    if (!turn) return;
    if (parsed.type === "approval.request") {
      void answerApproval(parsed, turn.ctx, write);
      return;
    }
    emitAgent(parsed, turn.ctx);
    if (parsed.type === "final" || parsed.type === "error") finishTurn();
  }

  function ensure() {
    if (child) return;
    const spec = commandOf(agent);
    child = launch(spec.bin, spec.args, { cwd: spec.cwd, env: spec.env, stdio: ["pipe", "pipe", "pipe"] });
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) if (line.trim()) handle(line);
    });
    child.on("exit", () => {
      child = null;
      ready?.(false);
      ready = null;
      failTurn("agent_failed", "에이전트가 멈췄어요");
    });
    write({ type: "hello", protocol: 1, agentId: agent.id });
  }

  async function waitReady() {
    if (child && !ready) return true;
    return new Promise<boolean>((resolve) => {
      ready = resolve;
      ensure();
      setTimeout(() => {
        if (ready !== resolve) return;
        ready = null;
        child?.kill();
        child = null;
        resolve(false);
      }, readyMs);
    });
  }

  return {
    async health() {
      const ok = await waitReady();
      return { ok, detail: ok ? undefined : "ready 시간 초과" };
    },
    async turn(text: string, ctx: TurnContext) {
      const ok = await waitReady();
      if (!ok) {
        ctx.emit({ type: "error", code: "agent_unavailable", message: "에이전트가 준비되지 않았어요" });
        return;
      }
      await new Promise<void>((finish) => {
        turn = { ctx, finish };
        const beginCancel = () => {
          write({ type: "cancel", turnId: ctx.turnId });
          const timer = setTimeout(() => {
            child?.kill();
            failTurn("cancelled", "중지했어요");
          }, cancelMs);
          if (turn) turn.cancelTimer = timer;
        };
        ctx.signal.addEventListener("abort", beginCancel, { once: true });
        if (ctx.signal.aborted) beginCancel();
        write({ type: "turn", turnId: ctx.turnId, sessionKey: ctx.sessionKey, text });
      });
    },
    async dispose() {
      child?.kill();
      child = null;
    },
  };
}

function parseLine(line: string, log: (line: string) => void) {
  try {
    const result = JsonlFromAgent.safeParse(JSON.parse(line));
    if (!result.success) {
      log(line);
      return null;
    }
    return result.data;
  } catch {
    log(line);
    return null;
  }
}

function emitAgent(msg: { type: string; label?: string; text?: string; toolName?: string; phase?: "started" | "finished" | "failed"; summary?: string; code?: string; message?: string }, ctx: TurnContext) {
  if (msg.type === "status" && msg.label) ctx.emit({ type: "status", label: msg.label });
  if (msg.type === "delta" && msg.text) ctx.emit({ type: "delta", text: msg.text });
  if (msg.type === "tool" && msg.toolName && msg.phase && msg.summary) {
    ctx.emit({ type: "tool", toolName: msg.toolName, phase: msg.phase, summary: redactText(msg.summary) });
  }
  if (msg.type === "final" && msg.text) ctx.emit({ type: "final", text: redactText(msg.text) });
  if (msg.type === "error" && msg.code && msg.message) ctx.emit({ type: "error", code: msg.code, message: msg.message });
}

async function answerApproval(
  msg: { requestId: string; toolName: string; input: Record<string, unknown>; summary: string },
  ctx: TurnContext,
  write: (value: unknown) => void,
) {
  const verdict = await ctx.requestTool({ toolName: msg.toolName, input: msg.input, summary: redactText(msg.summary) });
  write({
    type: "approval.result",
    requestId: msg.requestId,
    decision: verdict.decision === "approved" ? "approved" : "denied",
  });
}

function commandOf(agent: AdapterAgent) {
  const command = agent.options.command;
  if (!Array.isArray(command) || typeof command[0] !== "string") throw new Error("command_required");
  const cwd = typeof agent.options.cwd === "string" ? expandHome(agent.options.cwd) : undefined;
  const extra = agent.options.env;
  const env = { ...process.env };
  if (extra && typeof extra === "object") {
    for (const [key, value] of Object.entries(extra)) if (typeof value === "string") env[key] = expandHome(value);
  }
  return { bin: command[0], args: command.slice(1).map(String), cwd, env };
}

function expandHome(value: string) {
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}
