import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createClaudeAdapter, type SdkMessage, type SdkPermission, type SdkQuery } from "./claude-agent-sdk.js";
import type { AdapterAgent } from "./registry.js";
import type { AgentEvent, TurnContext } from "./types.js";

const agent: AdapterAgent = {
  id: "repo-helper",
  name: "레포 도우미",
  description: "저장소를 고쳐요",
  adapter: "claude-agent-sdk",
  capabilities: ["코드 수정"],
  options: { cwd: "~/dev/my-repo" },
  policy: "dev-default",
};

function harness(decision: "approved" | "denied" = "approved") {
  const events: AgentEvent[] = [];
  const tools: string[] = [];
  const controller = new AbortController();
  const ctx: TurnContext = {
    turnId: "t1",
    sessionKey: "chat-1",
    signal: controller.signal,
    async requestTool(req): Promise<import("./types.js").ToolVerdict> {
      tools.push(req.toolName);
      if (decision === "denied") return { decision: "denied", reason: "user" };
      return { decision: "approved", scope: "once" };
    },
    emit(event) {
      events.push(event);
    },
  };
  return { events, tools, controller, ctx };
}

function scripted(messages: SdkMessage[], onCall?: (options: Parameters<SdkQuery>[0]["options"]) => void): SdkQuery {
  return async function* (input) {
    onCall?.(input.options);
    const permission = await input.options.canUseTool("Edit", { file: "README.md" });
    yield* messagesFor(permission, messages);
  };
}

function* messagesFor(permission: SdkPermission, messages: SdkMessage[]): Generator<SdkMessage> {
  if (permission.behavior === "deny") {
    yield { type: "result", subtype: "success", result: "파일을 바꾸지 않았어요", session_id: "s1" };
    return;
  }
  yield* messages;
}

describe("claude agent sdk adapter", () => {
  it("sends a phone approval through canUseTool and emits the final text", async () => {
    const run = harness("approved");
    const seen: string[] = [];
    const query: SdkQuery = scripted(
      [
        { type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "고쳤어요" } } },
        { type: "result", subtype: "success", result: "README에 한 줄을 넣었어요", session_id: "sdk-1" },
      ],
      (options) => seen.push(options.resume ?? ""),
    );
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rd-204-"));
    const adapter = createClaudeAdapter(agent, { query, sessionsFile: path.join(dir, "sessions.json") });
    await adapter.runTurn("README에 한 줄 추가해 줘", run.ctx);
    expect(run.tools).toEqual(["Edit"]);
    expect(run.events).toContainEqual({ type: "delta", text: "고쳤어요" });
    expect(run.events.at(-1)).toEqual({ type: "final", text: "README에 한 줄을 넣었어요" });
    expect(seen).toEqual([""]);
  });

  it("tells the SDK the phone declined", async () => {
    const run = harness("denied");
    let permission: SdkPermission | null = null;
    const query: SdkQuery = async function* (input) {
      permission = await input.options.canUseTool("Write", { file: "README.md" });
      yield { type: "result", subtype: "success", result: "거절을 알고 파일을 두지 않았어요", session_id: "s2" };
    };
    const adapter = createClaudeAdapter(agent, { query, sessionsFile: path.join(os.tmpdir(), "rd-204-none.json") });
    await adapter.runTurn("README에 한 줄 추가해 줘", run.ctx);
    expect(permission).toEqual({ behavior: "deny", message: "사용자가 폰에서 거절했어요" });
  });

  it("resumes the saved SDK session on the next turn", async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "rd-204-")), "sessions.json");
    const resumes: Array<string | undefined> = [];
    const query: SdkQuery = async function* (input) {
      resumes.push(input.options.resume);
      await input.options.canUseTool("Edit", {});
      yield { type: "result", subtype: "success", result: "이어 썼어요", session_id: "sdk-9" };
    };
    const adapter = createClaudeAdapter(agent, { query, sessionsFile: file });
    const first = harness();
    await adapter.runTurn("처음", first.ctx);
    const second = harness();
    await adapter.runTurn("다음", second.ctx);
    expect(resumes).toEqual([undefined, "sdk-9"]);
  });

  it("aborts the SDK controller when the turn is stopped", async () => {
    const run = harness();
    let aborted = false;
    const query: SdkQuery = async function* (input) {
      run.controller.abort();
      aborted = input.options.abortController.signal.aborted;
      yield { type: "result", subtype: "error_max_turns", result: "중지", session_id: "s3" };
    };
    const adapter = createClaudeAdapter(agent, { query, sessionsFile: path.join(os.tmpdir(), "rd-204-abort.json") });
    await adapter.runTurn("멈춰", run.ctx);
    expect(aborted).toBe(true);
  });

  it("stays up when the SDK package is missing", async () => {
    const run = harness();
    const adapter = createClaudeAdapter(agent, {
      loadSdk: async () => {
        throw new Error("missing");
      },
    });
    const health = await adapter.health();
    expect(health.ok).toBe(false);
    await adapter.runTurn("README", run.ctx);
    expect(run.events.at(-1)).toEqual({ type: "error", code: "agent_unavailable", message: "SDK 패키지가 없어요" });
  });
});
