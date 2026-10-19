import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { credentialDir } from "../credential-store.js";
import { redactText } from "../redact/redact.js";
import type { AdapterAgent } from "./registry.js";
import type { AgentAdapter, AgentEvent, TurnContext } from "./types.js";

const DENY = "사용자가 폰에서 거절했어요";

export type SdkPermission =
  | { behavior: "allow" }
  | { behavior: "deny"; message: string };

export type SdkMessage = {
  type: string;
  subtype?: string;
  result?: string;
  session_id?: string;
  event?: {
    type?: string;
    delta?: { type?: string; text?: string };
    content_block?: { type?: string; name?: string };
  };
};

export type SdkQuery = (input: {
  prompt: string;
  options: {
    cwd?: string;
    model?: string;
    resume?: string;
    includePartialMessages: true;
    abortController: AbortController;
    permissionMode: "default";
    canUseTool: (toolName: string, input: Record<string, unknown>) => Promise<SdkPermission>;
  };
}) => AsyncIterable<SdkMessage>;

type Deps = {
  query?: SdkQuery;
  loadSdk?: () => Promise<SdkQuery>;
  sessionsFile?: string;
};

export function sdkCredentialLine(env: NodeJS.ProcessEnv = process.env) {
  return env.ANTHROPIC_API_KEY?.trim() ? "SDK 자격: 있음" : "SDK 자격: 없음";
}

export function createClaudeAdapter(agent: AdapterAgent, deps: Deps = {}): AgentAdapter {
  const sessions = deps.sessionsFile ?? path.join(credentialDir(), "sessions.json");
  return {
    descriptor: {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      adapterKind: "claude-agent-sdk",
      capabilities: agent.capabilities,
    },
    async health() {
      if (deps.query) return { ok: true };
      try {
        await resolveQuery(deps);
        return { ok: true, detail: sdkCredentialLine() };
      } catch {
        return { ok: false, detail: "SDK 패키지가 없어요" };
      }
    },
    async runTurn(text, ctx) {
      await runClaudeTurn(agent, ctx, text, sessions, deps);
    },
    async dispose() {
      return undefined;
    },
  };
}

export async function importSdkQuery(): Promise<SdkQuery> {
  const load = new Function("name", "return import(name)") as (name: string) => Promise<{ query: SdkQuery }>;
  const mod = await load("@anthropic-ai/claude-agent-sdk");
  return mod.query;
}

async function resolveQuery(deps: Deps) {
  if (deps.query) return deps.query;
  return (deps.loadSdk ?? importSdkQuery)();
}

async function runClaudeTurn(agent: AdapterAgent, ctx: TurnContext, text: string, sessions: string, deps: Deps) {
  const query = await loadOrFail(ctx, deps);
  if (!query) return;
  const abort = new AbortController();
  const stop = () => abort.abort();
  ctx.signal.addEventListener("abort", stop, { once: true });
  try {
    await streamQuery(query, turnOptions(agent, ctx, text, sessions, abort), ctx, sessions);
  } catch (err) {
    ctx.emit({ type: "error", code: "agent_failed", message: err instanceof Error ? err.message : "SDK 오류" });
  } finally {
    ctx.signal.removeEventListener("abort", stop);
  }
}

async function loadOrFail(ctx: TurnContext, deps: Deps) {
  try {
    return await resolveQuery(deps);
  } catch {
    ctx.emit({ type: "error", code: "agent_unavailable", message: "SDK 패키지가 없어요" });
    return null;
  }
}

function turnOptions(agent: AdapterAgent, ctx: TurnContext, text: string, sessions: string, abort: AbortController) {
  return {
    prompt: text,
    options: {
      cwd: typeof agent.options.cwd === "string" ? expandHome(agent.options.cwd) : undefined,
      model: typeof agent.options.model === "string" ? agent.options.model : undefined,
      resume: readSession(sessions, ctx.sessionKey),
      includePartialMessages: true as const,
      abortController: abort,
      permissionMode: "default" as const,
      canUseTool: (toolName: string, input: Record<string, unknown>) => allowTool(ctx, toolName, input),
    },
  };
}

async function streamQuery(
  query: SdkQuery,
  input: { prompt: string; options: Parameters<SdkQuery>[0]["options"] },
  ctx: TurnContext,
  sessions: string,
) {
  for await (const message of query(input)) applyMessage(message, ctx, sessions);
}

async function allowTool(ctx: TurnContext, toolName: string, input: Record<string, unknown>): Promise<SdkPermission> {
  ctx.emit({ type: "tool", toolName, phase: "started", summary: toolName });
  const verdict = await ctx.requestTool({ toolName, input });
  if (verdict.decision === "approved") {
    ctx.emit({ type: "tool", toolName, phase: "finished", summary: toolName });
    return { behavior: "allow" };
  }
  ctx.emit({ type: "tool", toolName, phase: "failed", summary: DENY });
  return { behavior: "deny", message: DENY };
}

function applyMessage(message: SdkMessage, ctx: TurnContext, sessions: string) {
  const event = streamEvent(message);
  if (event) ctx.emit(event);
  if (message.type === "result" && message.session_id) writeSession(sessions, ctx.sessionKey, message.session_id);
  if (message.type === "result" && message.subtype === "success" && message.result) {
    ctx.emit({ type: "final", text: redactText(message.result) });
  }
  if (message.type === "result" && message.subtype && message.subtype !== "success") {
    ctx.emit({ type: "error", code: message.subtype, message: message.result ?? "SDK가 끝내지 못했어요" });
  }
}

function streamEvent(message: SdkMessage): AgentEvent | null {
  if (message.type !== "stream_event") return null;
  const event = message.event;
  if (event?.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) {
    return { type: "delta", text: event.delta.text };
  }
  if (event?.type === "content_block_start" && event.content_block?.type === "tool_use" && event.content_block.name) {
    return { type: "tool", toolName: event.content_block.name, phase: "started", summary: event.content_block.name };
  }
  return null;
}

function readSession(file: string, key: string) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, string>;
    return parsed[key];
  } catch {
    return undefined;
  }
}

function writeSession(file: string, key: string, id: string) {
  const current = (() => {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, string>;
    } catch {
      return {};
    }
  })();
  current[key] = id;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(current), { mode: 0o600 });
}

function expandHome(value: string) {
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}
