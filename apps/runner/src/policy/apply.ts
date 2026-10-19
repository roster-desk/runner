import type { PolicyFile } from "../config/schema.js";

export type ApprovalScope = "once" | "session" | "always";
export type ApplyOutcome = "executed" | "skipped" | "expired" | "hash_mismatch";

export type WaitingApproval = {
  approvalId: string;
  turnId: string;
  agentId: string;
  toolName: string;
  risk: "low" | "medium" | "high";
  inputHash: string;
  expiresAt: number;
  allowedScopes: ApprovalScope[];
};

export type PhoneDecision = {
  approvalId: string;
  decision: "approved" | "denied";
  inputHash: string;
  scope?: ApprovalScope;
};

export type ApplyResult = {
  outcome: ApplyOutcome;
  scope: ApprovalScope;
  grant: { agent: string; tool: string; addedAt: string; from: "phone" } | null;
  log: string | null;
};

const idle: ApplyResult = { outcome: "skipped", scope: "once", grant: null, log: null };

type Row = WaitingApproval & { state: "pending" | "closed" };

export function createApprovalLedger(nowIso: () => string = () => new Date().toISOString()) {
  const rows = new Map<string, Row>();
  return {
    track(item: WaitingApproval) {
      rows.set(item.approvalId, { ...item, state: "pending" });
    },
    apply(decision: PhoneDecision, now: number) {
      return applyOnce(rows, decision, now, nowIso());
    },
    cancelTurn(turnId: string) {
      return closeTurn(rows, turnId);
    },
  };
}

export function addPhoneGrant(policy: PolicyFile, grant: ApplyResult["grant"]): PolicyFile {
  if (!grant) return policy;
  const exists = policy.granted.some((item) => item.agent === grant.agent && item.tool === grant.tool);
  if (exists) return policy;
  return { ...policy, granted: [...policy.granted, grant] };
}

export function alwaysLog(agent: string, tool: string) {
  return `폰에서 '항상 허용'을 추가했어요: ${agent}/${tool}`;
}

function applyOnce(rows: Map<string, Row>, decision: PhoneDecision, now: number, addedAt: string): ApplyResult {
  const row = rows.get(decision.approvalId);
  if (!row || row.state !== "pending") return idle;
  if (now >= row.expiresAt) return close(row, "expired");
  if (decision.inputHash !== row.inputHash) return { ...idle, outcome: "hash_mismatch" };
  if (decision.decision === "denied") return close(row, "skipped");
  return approve(row, decision.scope ?? "once", addedAt);
}

function approve(row: Row, requested: ApprovalScope, addedAt: string): ApplyResult {
  const scope = narrowScope(row, requested);
  const grant = scope === "always" ? { agent: row.agentId, tool: row.toolName, addedAt, from: "phone" as const } : null;
  row.state = "closed";
  return { outcome: "executed", scope, grant, log: grant ? alwaysLog(row.agentId, row.toolName) : null };
}

function narrowScope(row: Row, scope: ApprovalScope): ApprovalScope {
  if (row.risk === "high" && scope === "always") return "once";
  if (!row.allowedScopes.includes(scope)) return "once";
  return scope;
}

function closeTurn(rows: Map<string, Row>, turnId: string) {
  const closed: { approvalId: string; status: "CANCELLED" }[] = [];
  for (const row of rows.values()) {
    if (row.turnId !== turnId || row.state !== "pending") continue;
    row.state = "closed";
    closed.push({ approvalId: row.approvalId, status: "CANCELLED" });
  }
  return closed;
}

function close(row: Row, outcome: "expired" | "skipped"): ApplyResult {
  row.state = "closed";
  return { ...idle, outcome };
}
