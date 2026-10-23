import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createCommandAdapter } from "./command.js";
import type { AdapterAgent } from "./registry.js";
import type { AgentEvent, TurnContext } from "./types.js";

const node = process.execPath;

function agent(script: string, command = [node, "-e", script]): AdapterAgent {
  return {
    id: "daily-report",
    name: "일일 리포트",
    description: "",
    adapter: "command",
    capabilities: ["리포트 작성"],
    options: { command },
    policy: "strict",
  };
}

function harness() {
  const events: AgentEvent[] = [];
  const controller = new AbortController();
  const ctx: TurnContext = {
    turnId: "t1",
    sessionKey: "s1",
    signal: controller.signal,
    async requestTool() {
      return { decision: "approved", scope: "once" };
    },
    emit(event) {
      events.push(event);
    },
  };
  return { events, controller, ctx };
}

const ready = `
const readline = require("readline");
const rl = readline.createInterface({ input: process.stdin });
let turn = "";
rl.on("line", (line) => {
  const msg = JSON.parse(line);
  if (msg.type === "hello") process.stdout.write(JSON.stringify({ type: "ready", name: "n", capabilities: ["c"] }) + "\\n");
  if (msg.type === "turn") {
    turn = msg.turnId;
    process.stdout.write(JSON.stringify({ type: "approval.request", turnId: turn, requestId: "r1", toolName: "send_email", input: { to: "a" }, summary: "메일" }) + "\\n");
  }
  if (msg.type === "approval.result") process.stdout.write(JSON.stringify({ type: "final", turnId: turn, text: "리포트를 보냈어요." }) + "\\n");
});
`;

describe("command adapter", () => {
  it("approves a tool request and finishes", async () => {
    const run = harness();
    const adapter = createCommandAdapter(agent(ready));
    await adapter.runTurn("오늘 리포트", run.ctx);
    expect(run.events.at(-1)).toEqual({ type: "final", text: "리포트를 보냈어요." });
    await adapter.dispose();
  });

  it("ignores a bad line and still finishes", async () => {
    const logs: string[] = [];
    const script = ready.replace(
      'if (msg.type === "turn") {',
      'if (msg.type === "turn") { process.stdout.write("not-json\\n");',
    );
    const run = harness();
    const adapter = createCommandAdapter(agent(script), { log: (line) => logs.push(line) });
    await adapter.runTurn("리포트", run.ctx);
    expect(logs).toContain("not-json");
    expect(run.events.at(-1)).toMatchObject({ type: "final" });
    await adapter.dispose();
  });

  it("closes the turn when the process exits and starts again next time", async () => {
    const script = `
      const readline = require("readline");
      const rl = readline.createInterface({ input: process.stdin });
      rl.on("line", (line) => {
        const msg = JSON.parse(line);
        if (msg.type === "hello") process.stdout.write(JSON.stringify({ type: "ready", name: "n", capabilities: ["c"] }) + "\\n");
        if (msg.type === "turn") process.exit(1);
      });
    `;
    let starts = 0;
    const { spawn } = await import("node:child_process");
    const run = harness();
    const adapter = createCommandAdapter(agent(script), {
      spawnProcess: ((bin: string, args: readonly string[], opts: object) => {
        starts += 1;
        return spawn(bin, args, opts);
      }) as never,
    });
    await adapter.runTurn("리포트", run.ctx);
    expect(run.events.at(-1)).toMatchObject({ type: "error", code: "agent_failed" });
    const again = harness();
    await adapter.runTurn("다시", again.ctx);
    expect(starts).toBe(2);
    await adapter.dispose();
  });

  it("kills the process when cancel is not answered", async () => {
    const script = `
      const readline = require("readline");
      const rl = readline.createInterface({ input: process.stdin });
      rl.on("line", (line) => {
        const msg = JSON.parse(line);
        if (msg.type === "hello") process.stdout.write(JSON.stringify({ type: "ready", name: "n", capabilities: ["c"] }) + "\\n");
      });
    `;
    const run = harness();
    const adapter = createCommandAdapter(agent(script), { cancelMs: 40 });
    const pending = adapter.runTurn("멈춰", run.ctx);
    run.controller.abort();
    await pending;
    expect(run.events.at(-1)).toMatchObject({ type: "error", code: "cancelled" });
  });

  it("fails health when ready never arrives", async () => {
    const adapter = createCommandAdapter(agent("setInterval(() => {}, 1000);"), { readyMs: 40 });
    const health = await adapter.health();
    expect(health.ok).toBe(false);
    await adapter.dispose();
  });

  it("runs the python example through approval to final", async () => {
    const file = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../../packages/agent-kit/examples/python/agent.py",
    );
    const run = harness();
    const python = process.platform === "win32" ? "python" : "python3";
    const adapter = createCommandAdapter(agent("", [python, file]));
    await adapter.runTurn("오늘 리포트 만들어 줘", run.ctx);
    expect(run.events.at(-1)).toEqual({ type: "final", text: "리포트를 보냈어요." });
    await adapter.dispose();
  });
});
