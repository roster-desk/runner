import { describe, expect, it, vi } from "vitest";
import type { AdapterAgent } from "../adapters/registry.js";
import type { AgentAdapter, TurnContext } from "../adapters/types.js";
import type { PolicyFile } from "../config/schema.js";
import { createTurnEngine, type Frame } from "./engine.js";

const turnId = "11111111-1111-4111-8111-111111111111";
const conversationId = "22222222-2222-4222-8222-222222222222";

const agent: AdapterAgent = {
  id: "repo-helper",
  name: "Repo",
  description: "",
  adapter: "command",
  capabilities: [],
  options: {},
  policy: "dev",
};

const policy: PolicyFile = {
  version: 1,
  profiles: {
    dev: {
      default: "ask",
      rules: [
        { match: { tool: "Read" }, action: "allow", risk: "low" },
        { match: { tool: "Bash" }, action: "ask", risk: "high" },
        { match: { tool: "rm" }, action: "deny", risk: "high" },
      ],
    },
  },
  granted: [],
};

function fakeAdapter(run: (text: string, ctx: TurnContext) => Promise<void>, ok = true): AgentAdapter {
  return {
    descriptor: { id: agent.id, name: agent.name, description: "", adapterKind: "command", capabilities: [] },
    health: async () => ({ ok }),
    runTurn: run,
    dispose: async () => undefined,
  };
}

function setup(run: (text: string, ctx: TurnContext) => Promise<void>, opts: { ok?: boolean; env?: NodeJS.ProcessEnv } = {}) {
  const frames: Frame[] = [];
  const saveGrant = vi.fn();
  const engine = createTurnEngine({
    send: (frame) => frames.push(frame),
    agents: () => [agent],
    policy: () => policy,
    createAdapter: () => fakeAdapter(run, opts.ok ?? true),
    saveGrant,
    log: () => undefined,
    env: opts.env ?? {},
  });
  const start = (text: string, id = agent.id) =>
    engine.start({ turnId, conversationId, agentId: id, text, sessionKey: conversationId });
  const types = () => frames.map((frame) => frame.type);
  const find = (type: string) => frames.find((frame) => frame.type === type);
  return { engine, frames, start, types, find, saveGrant };
}

describe("turn engine", () => {
  it("streams deltas then one final and closes the turn", async () => {
    const t = setup(async (text, ctx) => {
      ctx.emit({ type: "delta", text: "안녕" });
      ctx.emit({ type: "final", text: `받음: ${text}` });
    });
    await t.start("hi");
    expect(t.types()).toEqual(["turn.status", "message.delta", "message.final", "turn.status"]);
    expect(t.find("message.final")?.data).toMatchObject({ turnId, conversationId, text: "받음: hi", kind: "text" });
    expect(t.frames.at(-1)?.data).toMatchObject({ state: "done" });
  });

  it("rejects unknown agents and unhealthy agents", async () => {
    const missing = setup(async () => undefined);
    await missing.start("hi", "nobody");
    expect(missing.find("turn.rejected")?.data).toMatchObject({ reason: "agent_unavailable" });
    const sick = setup(async () => undefined, { ok: false });
    await sick.start("hi");
    expect(sick.find("turn.rejected")?.data).toMatchObject({ reason: "agent_unavailable" });
  });

  it("rejects a second turn in the same conversation", async () => {
    let release: (() => void) | null = null;
    const t = setup((_text, ctx) => new Promise<void>((resolve) => {
      release = () => {
        ctx.emit({ type: "final", text: "끝" });
        resolve();
      };
    }));
    const first = t.start("one");
    await t.engine.start({ turnId: "33333333-3333-4333-8333-333333333333", conversationId, agentId: agent.id, text: "two", sessionKey: "s" });
    expect(t.find("turn.rejected")?.data).toMatchObject({ reason: "turn_in_progress" });
    await vi.waitFor(() => expect(release).not.toBeNull());
    release!();
    await first;
  });

  it("allows and denies by policy without asking the phone", async () => {
    const verdicts: string[] = [];
    const t = setup(async (_text, ctx) => {
      verdicts.push((await ctx.requestTool({ toolName: "Read", input: {} })).decision);
      verdicts.push((await ctx.requestTool({ toolName: "rm", input: {} })).decision);
      ctx.emit({ type: "final", text: "ok" });
    });
    await t.start("go");
    expect(verdicts).toEqual(["approved", "denied"]);
    expect(t.find("approval.request")).toBeUndefined();
  });

  it("asks the phone, waits, and runs once on approval", async () => {
    let verdict: unknown = null;
    const t = setup(async (_text, ctx) => {
      verdict = await ctx.requestTool({ toolName: "Edit", input: { path: "a.txt" }, summary: "a.txt 고치기" });
      ctx.emit({ type: "final", text: "고쳤어요" });
    });
    const done = t.start("edit");
    await vi.waitFor(() => expect(t.find("approval.request")).toBeDefined());
    const request = t.find("approval.request")!.data as { approvalId: string; inputHash: string; allowedScopes: string[]; risk: string };
    expect(request.risk).toBe("medium");
    expect(request.allowedScopes).toEqual(["once", "session", "always"]);
    expect(t.types()).toContain("turn.status");
    t.engine.decide({ approvalId: request.approvalId, decision: "approved", inputHash: request.inputHash, scope: "always" });
    t.engine.decide({ approvalId: request.approvalId, decision: "approved", inputHash: request.inputHash, scope: "always" });
    await done;
    expect(verdict).toEqual({ decision: "approved", scope: "always" });
    expect(t.saveGrant).toHaveBeenCalledTimes(1);
    expect(t.frames.filter((frame) => frame.type === "approval.applied").map((frame) => frame.data.outcome)).toEqual(["executed"]);
  });

  it("refuses a decision whose hash does not match and keeps waiting", async () => {
    const t = setup(async (_text, ctx) => {
      await ctx.requestTool({ toolName: "Bash", input: { cmd: "ls" } });
      ctx.emit({ type: "final", text: "ok" });
    });
    const done = t.start("run");
    await vi.waitFor(() => expect(t.find("approval.request")).toBeDefined());
    const request = t.find("approval.request")!.data as { approvalId: string; inputHash: string; allowedScopes: string[] };
    expect(request.allowedScopes).toEqual(["once"]);
    t.engine.decide({ approvalId: request.approvalId, decision: "approved", inputHash: "f".repeat(64), scope: "once" });
    expect(t.find("approval.applied")?.data).toMatchObject({ outcome: "hash_mismatch" });
    t.engine.decide({ approvalId: request.approvalId, decision: "denied", inputHash: request.inputHash, scope: "once" });
    await done;
  });

  it("remembers a session grant for the same tool", async () => {
    let asked = 0;
    const t = setup(async (_text, ctx) => {
      await ctx.requestTool({ toolName: "Edit", input: { n: 1 } });
      await ctx.requestTool({ toolName: "Edit", input: { n: 2 } });
      ctx.emit({ type: "final", text: "ok" });
    });
    const done = t.start("edit");
    await vi.waitFor(() => expect(t.find("approval.request")).toBeDefined());
    const request = t.find("approval.request")!.data as { approvalId: string; inputHash: string };
    t.engine.decide({ approvalId: request.approvalId, decision: "approved", inputHash: request.inputHash, scope: "session" });
    await done;
    asked = t.frames.filter((frame) => frame.type === "approval.request").length;
    expect(asked).toBe(1);
  });

  it("cancel aborts the turn and denies the waiting approval", async () => {
    let verdict: unknown = null;
    const t = setup(async (_text, ctx) => {
      verdict = await ctx.requestTool({ toolName: "Edit", input: {} });
    });
    const done = t.start("edit");
    await vi.waitFor(() => expect(t.find("approval.request")).toBeDefined());
    expect(t.engine.cancel(turnId).aborted).toBe(true);
    await done;
    expect(verdict).toEqual({ decision: "denied", reason: "cancelled" });
    expect(t.frames.at(-1)?.data).not.toMatchObject({ state: "done" });
  });

  it("hides secrets in what leaves the PC", async () => {
    const t = setup(async (_text, ctx) => {
      ctx.emit({ type: "delta", text: "key sk-ant-abcdef123456" });
      ctx.emit({ type: "final", text: "token=supersecretvalue" });
    }, { env: { MY_TOKEN: "supersecretvalue" } });
    await t.start("hi");
    const out = JSON.stringify(t.frames);
    expect(out).not.toContain("sk-ant-abcdef123456");
    expect(out).not.toContain("supersecretvalue");
  });

  it("turns a thrown adapter error into an error message", async () => {
    const t = setup(async () => {
      throw new Error("boom");
    });
    await t.start("hi");
    expect(t.find("message.final")?.data).toMatchObject({ kind: "error", text: "boom" });
    expect(t.frames.at(-1)?.data).toMatchObject({ state: "error" });
  });
});
