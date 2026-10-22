import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { JsonlFromAgent } from "@rosterdesk/protocol";
import { redactText } from "../redact/redact.js";
import type { AdapterAgent } from "./registry.js";
import type { AgentAdapter, AgentEvent, TurnContext } from "./types.js";

type HttpOptions = { ok: true; url: string; headers: Record<string, string>; timeoutMs: number } | { ok: false };
type Posted = { kind: "accepted" } | { kind: "json"; body: unknown } | { kind: "error"; event: AgentEvent };
type AgentMessage = ReturnType<typeof parseEvent> & object;

export function createHttpAdapter(agent: AdapterAgent, env: NodeJS.ProcessEnv = process.env): AgentAdapter {
  const options = readOptions(agent, env);
  const session: { stop: (() => Promise<void>) | null } = { stop: null };
  return {
    descriptor: descriptorOf(agent),
    health: () => Promise.resolve(healthOf(options)),
    runTurn: (text, ctx) => runTurn(options, text, ctx, session),
    dispose: () => session.stop?.() ?? Promise.resolve(),
  };
}

function healthOf(options: HttpOptions) {
  return { ok: options.ok, detail: options.ok ? undefined : "웹훅 주소가 없어요" };
}

async function runTurn(options: HttpOptions, text: string, ctx: TurnContext, session: { stop: (() => Promise<void>) | null }) {
  if (!options.ok) {
    ctx.emit({ type: "error", code: "agent_unavailable", message: "웹훅 주소가 없어요" });
    return;
  }
  const gate = createGate(ctx);
  const callback = await openCallback(gate);
  session.stop = callback.close;
  try {
    await deliver(options, text, ctx, callback.url, gate);
  } finally {
    session.stop = null;
    await callback.close();
  }
}

function descriptorOf(agent: AdapterAgent) {
  return {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    adapterKind: "http" as const,
    capabilities: agent.capabilities,
  };
}

function readOptions(agent: AdapterAgent, env: NodeJS.ProcessEnv): HttpOptions {
  const url = agent.options.url;
  if (typeof url !== "string" || !url.startsWith("http")) return { ok: false };
  const timeoutSec = typeof agent.options.timeoutSec === "number" ? agent.options.timeoutSec : 300;
  return { ok: true, url, headers: expandHeaders(agent.options.headers, env), timeoutMs: timeoutSec * 1000 };
}

async function deliver(options: Extract<HttpOptions, { ok: true }>, text: string, ctx: TurnContext, callbackUrl: string, gate: Gate) {
  const posted = await postJson(options, turnBody(text, ctx, callbackUrl), ctx);
  if (posted.kind === "error") ctx.emit(posted.event);
  if (posted.kind === "accepted") await gate.wait(options.timeoutMs);
  if (posted.kind === "json") await followSync(posted.body, options, ctx);
}

async function followSync(body: unknown, options: Extract<HttpOptions, { ok: true }>, ctx: TurnContext) {
  const event = parseEvent(body);
  if (!event) {
    ctx.emit({ type: "error", code: "bad_response", message: "응답 형식이 이상해요" });
    return;
  }
  if (event.type !== "approval.request") {
    emitHttp(event, ctx);
    return;
  }
  const next = await postJson(options, await approvalBody(event, ctx), ctx);
  if (next.kind === "json") await followSync(next.body, options, ctx);
  if (next.kind === "error") ctx.emit(next.event);
}

function turnBody(text: string, ctx: TurnContext, callbackUrl: string) {
  return { type: "turn", turnId: ctx.turnId, sessionKey: ctx.sessionKey, text, callbackUrl };
}

async function postJson(options: Extract<HttpOptions, { ok: true }>, body: unknown, ctx: TurnContext): Promise<Posted> {
  try {
    const response = await fetch(options.url, {
      method: "POST",
      headers: { "content-type": "application/json", ...options.headers },
      body: JSON.stringify(body),
      signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(options.timeoutMs)]),
    });
    return classify(response);
  } catch (error) {
    return { kind: "error", event: errorEvent(error, ctx.signal) };
  }
}

async function classify(response: Response): Promise<Posted> {
  if (response.status === 202) return { kind: "accepted" };
  if (response.status >= 400) return { kind: "error", event: statusError(response.status) };
  try {
    return { kind: "json", body: await response.json() };
  } catch {
    return { kind: "error", event: { type: "error", code: "bad_response", message: "응답 형식이 이상해요" } };
  }
}

function statusError(status: number): AgentEvent {
  return { type: "error", code: "http_status", message: `웹훅이 ${status} 응답을 돌려줬어요` };
}

function errorEvent(error: unknown, signal: AbortSignal): AgentEvent {
  if (signal.aborted) return { type: "error", code: "cancelled", message: "중지했어요" };
  if (error instanceof Error && error.name === "TimeoutError") {
    return { type: "error", code: "timeout", message: "웹훅 응답이 없어요" };
  }
  return { type: "error", code: "http_failed", message: "웹훅을 부르지 못했어요" };
}

function expandHeaders(headers: unknown, env: NodeJS.ProcessEnv) {
  if (!headers || typeof headers !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") out[key] = value.replace(/\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, name: string) => env[name] ?? "");
  }
  return out;
}

function parseEvent(raw: unknown) {
  const value = typeof raw === "string" ? parseJson(raw) : raw;
  const result = JsonlFromAgent.safeParse(value);
  return result.success ? result.data : null;
}

function parseJson(raw: string) {
  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    return error;
  }
}

function emitHttp(event: NonNullable<AgentMessage>, ctx: TurnContext) {
  if (event.type === "status") ctx.emit({ type: "status", label: event.label });
  if (event.type === "delta") ctx.emit({ type: "delta", text: event.text });
  if (event.type === "tool") ctx.emit({ type: "tool", toolName: event.toolName, phase: event.phase, summary: redactText(event.summary) });
  if (event.type === "final") ctx.emit({ type: "final", text: redactText(event.text) });
  if (event.type === "error") ctx.emit({ type: "error", code: event.code, message: event.message });
}

async function approvalBody(event: Extract<NonNullable<AgentMessage>, { type: "approval.request" }>, ctx: TurnContext) {
  const verdict = await ctx.requestTool({ toolName: event.toolName, input: event.input, summary: redactText(event.summary) });
  return { type: "approval.result", requestId: event.requestId, decision: verdict.decision === "approved" ? "approved" : "denied" };
}

type Gate = ReturnType<typeof createGate>;

function createGate(ctx: TurnContext) {
  let finish = () => {};
  const done = new Promise<void>((resolve) => {
    finish = resolve;
  });
  return {
    async wait(ms: number) {
      const timer = setTimeout(() => failWait(ctx, finish), ms);
      await done;
      clearTimeout(timer);
    },
    push(event: NonNullable<AgentMessage>) {
      emitHttp(event, ctx);
      if (event.type === "final" || event.type === "error") finish();
    },
    approve: (event: Extract<NonNullable<AgentMessage>, { type: "approval.request" }>) => approvalBody(event, ctx),
  };
}

function failWait(ctx: TurnContext, finish: () => void) {
  ctx.emit({ type: "error", code: "timeout", message: "웹훅 응답이 없어요" });
  finish();
}

async function openCallback(gate: Gate) {
  const token = randomBytes(16).toString("base64url");
  const server = createServer((req, res) => {
    void handleCallback(req, res, token, gate);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return { url: `http://127.0.0.1:${port}/callback/${token}`, close: () => closeServer(server) };
}

async function handleCallback(req: IncomingMessage, res: ServerResponse, token: string, gate: Gate) {
  if (req.method !== "POST" || !req.url?.includes(token)) {
    res.writeHead(404).end();
    return;
  }
  const event = parseEvent(await readBody(req));
  if (!event) {
    res.writeHead(400).end();
    return;
  }
  if (event.type === "approval.request") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(await gate.approve(event)));
    return;
  }
  gate.push(event);
  res.writeHead(204).end();
}

function readBody(req: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function closeServer(server: ReturnType<typeof createServer>) {
  return new Promise<void>((resolve) => server.close(() => resolve()));
}
