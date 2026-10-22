import { describe, expect, it } from "vitest";
import type { PolicyFile } from "../config/schema.js";
import { addPhoneGrant, alwaysLog, createApprovalLedger, type WaitingApproval } from "./apply.js";

const hash = "a".repeat(64);
const other = "b".repeat(64);

function waiting(patch: Partial<WaitingApproval> = {}): WaitingApproval {
  return {
    approvalId: "11111111-1111-4111-8111-111111111111",
    turnId: "22222222-2222-4222-8222-222222222222",
    agentId: "daily-report",
    toolName: "write_file",
    risk: "medium",
    inputHash: hash,
    expiresAt: 1_000,
    allowedScopes: ["once", "session", "always"],
    ...patch,
  };
}

describe("approval apply", () => {
  it("runs the tool once when the same decision is sent twice", () => {
    const ledger = createApprovalLedger(() => "2026-10-19T00:00:00Z");
    ledger.track(waiting());
    const decision = { approvalId: waiting().approvalId, decision: "approved" as const, inputHash: hash, scope: "once" as const };
    const first = ledger.apply(decision, 500);
    const second = ledger.apply(decision, 500);
    expect(first.outcome).toBe("executed");
    expect(second.outcome).toBe("skipped");
    expect(second.grant).toBeNull();
  });

  it("does not run when the hash differs", () => {
    const ledger = createApprovalLedger();
    ledger.track(waiting());
    const mismatch = ledger.apply({ approvalId: waiting().approvalId, decision: "approved", inputHash: other }, 500);
    const later = ledger.apply({ approvalId: waiting().approvalId, decision: "approved", inputHash: hash, scope: "once" }, 500);
    expect(mismatch.outcome).toBe("hash_mismatch");
    expect(later.outcome).toBe("executed");
  });

  it("returns expired after the deadline and does not run", () => {
    const ledger = createApprovalLedger();
    ledger.track(waiting());
    const late = ledger.apply({ approvalId: waiting().approvalId, decision: "approved", inputHash: hash }, 1_000);
    const again = ledger.apply({ approvalId: waiting().approvalId, decision: "approved", inputHash: hash }, 1_001);
    expect(late.outcome).toBe("expired");
    expect(late.grant).toBeNull();
    expect(again.outcome).toBe("skipped");
  });

  it("drops always on a high risk tool and writes a grant for a medium one", () => {
    const ledger = createApprovalLedger(() => "2026-10-19T00:00:00Z");
    ledger.track(waiting({ approvalId: "22222222-2222-4222-8222-222222222222", risk: "high", toolName: "Bash" }));
    ledger.track(waiting());
    const high = ledger.apply(
      { approvalId: "22222222-2222-4222-8222-222222222222", decision: "approved", inputHash: hash, scope: "always" },
      500,
    );
    const medium = ledger.apply({ approvalId: waiting().approvalId, decision: "approved", inputHash: hash, scope: "always" }, 500);
    expect(high).toMatchObject({ outcome: "executed", scope: "once", grant: null });
    expect(medium.scope).toBe("always");
    expect(medium.log).toBe(alwaysLog("daily-report", "write_file"));
    const policy: PolicyFile = { version: 1, profiles: {}, granted: [] };
    expect(addPhoneGrant(policy, medium.grant).granted).toEqual([medium.grant]);
  });

  it("narrows an unknown scope to once", () => {
    const ledger = createApprovalLedger();
    ledger.track(waiting({ allowedScopes: ["once"] }));
    const result = ledger.apply({ approvalId: waiting().approvalId, decision: "approved", inputHash: hash, scope: "session" }, 500);
    expect(result).toMatchObject({ outcome: "executed", scope: "once", grant: null });
  });

  it("cancels a waiting approval with the turn", () => {
    const ledger = createApprovalLedger();
    ledger.track(waiting());
    expect(ledger.cancelTurn(waiting().turnId)).toEqual([{ approvalId: waiting().approvalId, status: "CANCELLED" }]);
    const late = ledger.apply({ approvalId: waiting().approvalId, decision: "approved", inputHash: hash }, 500);
    expect(late.outcome).toBe("skipped");
  });
});
