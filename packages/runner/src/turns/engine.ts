import { randomUUID } from "node:crypto";
import type { AdapterAgent } from "../adapters/registry.js";
import type { AgentAdapter, AgentEvent, ToolRequest, ToolVerdict } from "../adapters/types.js";
import type { PolicyFile } from "../config/schema.js";
import { createApprovalLedger, type ApprovalScope, type ApplyResult, type PhoneDecision } from "../policy/apply.js";
import { evaluatePolicy } from "../policy/evaluate.js";
import { inputHash, redactText } from "../redact/redact.js";

const APPROVAL_MS = 10 * 60 * 1000;

export type Frame = { v: 2; id: string; type: string; ts: number; data: Record<string, unknown> };

export type TurnStart = {
  turnId: string;
  conversationId: string;
  agentId: string;
  clientId?: string;
  text: string;
  sessionKey: string;
};

export type EngineDeps = {
  send: (frame: Frame) => void;
  agents: () => AdapterAgent[];
  policy: () => PolicyFile;
  createAdapter: (agent: AdapterAgent) => AgentAdapter;
  saveGrant?: (grant: NonNullable<ApplyResult["grant"]>) => void;
  onApproval?: (row: { at: number; agentId: string; toolName: string; risk: string; outcome: string }) => void;
  log?: (line: string) => void;
  env?: NodeJS.ProcessEnv;
  now?: () => number;
};

type Running = { turnId: string; conversationId: string; controller: AbortController };
type Waiting = {
  turnId: string;
  agentId: string;
  toolName: string;
  risk: string;
  resolve: (verdict: ToolVerdict) => void;
  timer: NodeJS.Timeout;
};

export function createTurnEngine(deps: EngineDeps) {
  const now = deps.now ?? Date.now;
  const env = deps.env ?? process.env;
  const log = deps.log ?? ((line) => console.log(`[runner] ${line}`));
  const adapters = new Map<string, { adapter: AgentAdapter; config: string }>();
  const running = new Map<string, Running>();
  const busy = new Set<string>();
  const waiting = new Map<string, Waiting>();
  const sessionGrants = new Set<string>();
  const ledger = createApprovalLedger();

  function emit(type: string, data: Record<string, unknown>) {
    deps.send({ v: 2, id: randomUUID(), type, ts: now(), data });
  }

  function adapterFor(agent: AdapterAgent) {
    const config = JSON.stringify(agent);
    const existing = adapters.get(agent.id);
    if (existing?.config === config) return existing.adapter;
    if (existing) void existing.adapter.dispose().catch(() => undefined);
    const created = deps.createAdapter(agent);
    adapters.set(agent.id, { adapter: created, config });
    return created;
  }

  async function start(turn: TurnStart) {
    const agent = deps.agents().find((row) => row.id === turn.agentId);
    const base = { turnId: turn.turnId, conversationId: turn.conversationId };
    if (!agent) return emit("turn.rejected", { ...base, reason: "agent_unavailable" });
    if (busy.has(turn.conversationId)) return emit("turn.rejected", { ...base, reason: "turn_in_progress" });
    busy.add(turn.conversationId);
    const adapter = safeAdapter(agent);
    const health = adapter ? await adapter.health().catch(() => ({ ok: false })) : { ok: false };
    if (!adapter || !health.ok) {
      busy.delete(turn.conversationId);
      return emit("turn.rejected", { ...base, reason: "agent_unavailable" });
    }

    const controller = new AbortController();
    running.set(turn.turnId, { ...base, controller });
    emit("turn.status", { ...base, state: "running" });
    const outcome = { failed: false, final: false };
    try {
      await adapter.runTurn(turn.text, {
        turnId: turn.turnId,
        sessionKey: turn.sessionKey,
        signal: controller.signal,
        emit: (event) => onEvent(event, turn, outcome, controller.signal),
        requestTool: (req) => requestTool(req, turn, agent, controller.signal),
      });
    } catch (err) {
      if (!controller.signal.aborted) {
        const message = err instanceof Error ? err.message : "unknown";
        onEvent({ type: "error", code: "agent_failed", message }, turn, outcome, controller.signal);
      }
    } finally {
      running.delete(turn.turnId);
      busy.delete(turn.conversationId);
      if (!controller.signal.aborted) emit("turn.status", { ...base, state: outcome.failed ? "error" : "done" });
    }
  }

  function safeAdapter(agent: AdapterAgent) {
    try {
      return adapterFor(agent);
    } catch (err) {
      log(`에이전트 '${agent.id}'를 열지 못했어요: ${err instanceof Error ? err.message : "unknown"}`);
      return null;
    }
  }

  function onEvent(event: AgentEvent, turn: TurnStart, outcome: { failed: boolean; final: boolean }, signal: AbortSignal) {
    if (signal.aborted) return;
    const base = { turnId: turn.turnId, conversationId: turn.conversationId };
    if (event.type === "delta") return emit("message.delta", { ...base, text: redactText(event.text, env) });
    if (event.type === "status") return emit("turn.status", { ...base, state: "running", label: redactText(event.label, env) });
    if (event.type === "tool") {
      return emit("tool.event", { ...base, toolName: event.toolName, phase: event.phase, summary: redactText(event.summary, env) });
    }
    if (outcome.final) return;
    outcome.final = true;
    if (event.type === "error") outcome.failed = true;
    const text = event.type === "final" ? event.text : event.message;
    emit("message.final", {
      ...base,
      clientId: randomUUID(),
      text: redactText(text, env),
      kind: event.type === "final" ? "text" : "error",
    });
  }

  function requestTool(req: ToolRequest, turn: TurnStart, agent: AdapterAgent, signal: AbortSignal): Promise<ToolVerdict> {
    if (signal.aborted) return Promise.resolve({ decision: "denied", reason: "cancelled" });
    const raw = JSON.stringify(req.input ?? {});
    const grantKey = `${turn.sessionKey}\u0000${agent.id}\u0000${req.toolName}`;
    if (sessionGrants.has(grantKey)) return Promise.resolve({ decision: "approved", scope: "session" });
    const hit = evaluatePolicy(deps.policy(), {
      agentId: agent.id,
      profile: agent.policy,
      toolName: req.toolName,
      inputText: raw,
    });
    if (hit.action === "allow") return Promise.resolve({ decision: "approved", scope: "once" });
    if (hit.action === "deny") return Promise.resolve({ decision: "denied", reason: "policy" });
    return askPhone(req, raw, hit.risk, turn, agent, grantKey);
  }

  function askPhone(
    req: ToolRequest,
    raw: string,
    risk: "low" | "medium" | "high",
    turn: TurnStart,
    agent: AdapterAgent,
    grantKey: string,
  ): Promise<ToolVerdict> {
    const approvalId = randomUUID();
    const hash = inputHash(raw);
    const expiresAt = now() + APPROVAL_MS;
    const allowedScopes: ApprovalScope[] = risk === "high" ? ["once"] : ["once", "session", "always"];
    ledger.track({ approvalId, turnId: turn.turnId, agentId: agent.id, toolName: req.toolName, risk, inputHash: hash, expiresAt, allowedScopes });
    const base = { turnId: turn.turnId, conversationId: turn.conversationId };
    emit("approval.request", {
      approvalId,
      ...base,
      agentId: agent.id,
      toolName: req.toolName.slice(0, 80),
      risk,
      summary: redactText(req.summary ?? req.toolName, env).slice(0, 200),
      inputPreview: redactText(raw, env).slice(0, 4000),
      inputHash: hash,
      expiresAt,
      allowedScopes,
    });
    emit("turn.status", { ...base, state: "awaiting_approval", label: req.toolName });
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        waiting.delete(approvalId);
        ledger.apply({ approvalId, decision: "denied", inputHash: hash }, Number.MAX_SAFE_INTEGER);
        emit("approval.applied", { approvalId, outcome: "expired" });
        deps.onApproval?.({ at: now(), agentId: agent.id, toolName: req.toolName, risk, outcome: "expired" });
        resolve({ decision: "denied", reason: "expired" });
      }, Math.max(0, expiresAt - now()));
      waiting.set(approvalId, {
        turnId: turn.turnId,
        agentId: agent.id,
        toolName: req.toolName,
        risk,
        timer,
        resolve: (verdict) => {
          if (verdict.decision === "approved" && verdict.scope === "session") sessionGrants.add(grantKey);
          if (verdict.decision === "approved") emit("turn.status", { ...base, state: "running" });
          resolve(verdict);
        },
      });
    });
  }

  function decide(decision: PhoneDecision) {
    const wait = waiting.get(decision.approvalId);
    const result = ledger.apply(decision, now());
    if (result.outcome === "skipped" && !wait) return result;
    emit("approval.applied", { approvalId: decision.approvalId, outcome: result.outcome });
    if (result.outcome === "hash_mismatch" || !wait) return result;
    clearTimeout(wait.timer);
    waiting.delete(decision.approvalId);
    deps.onApproval?.({ at: now(), agentId: wait.agentId, toolName: wait.toolName, risk: wait.risk, outcome: result.outcome });
    if (result.grant) {
      deps.saveGrant?.(result.grant);
      if (result.log) log(result.log);
    }
    if (result.outcome === "executed") wait.resolve({ decision: "approved", scope: result.scope });
    else wait.resolve({ decision: "denied", reason: result.outcome === "expired" ? "expired" : "user" });
    return result;
  }

  function cancel(turnId: string) {
    const row = running.get(turnId);
    ledger.cancelTurn(turnId);
    for (const [approvalId, wait] of waiting) {
      if (wait.turnId !== turnId) continue;
      clearTimeout(wait.timer);
      waiting.delete(approvalId);
      wait.resolve({ decision: "denied", reason: "cancelled" });
    }
    if (!row) return { aborted: false, conversationId: "" };
    row.controller.abort();
    emit("turn.status", { turnId, conversationId: row.conversationId, state: "cancelled" });
    return { aborted: true, conversationId: row.conversationId };
  }

  async function reload() {
    const ids = new Set(deps.agents().map((agent) => agent.id));
    for (const [id, row] of adapters) {
      if (ids.has(id)) continue;
      adapters.delete(id);
      await row.adapter.dispose().catch(() => undefined);
    }
  }

  async function dispose() {
    for (const turnId of [...running.keys()]) cancel(turnId);
    for (const row of adapters.values()) await row.adapter.dispose().catch(() => undefined);
    adapters.clear();
  }

  return { start, decide, cancel, reload, dispose };
}
