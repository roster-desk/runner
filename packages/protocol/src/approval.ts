import { z } from "zod";

export const RiskLevel = z.enum(["low", "medium", "high"]);

/** summary·inputPreview는 encVersion이 있으면 봉투(JSON)라 평문 길이 제한 대신 넉넉한 상한을 쓴다. */
export const ApprovalRequest = z
  .object({
  approvalId: z.string().uuid(),
  turnId: z.string().uuid(),
  conversationId: z.string().uuid(),
  agentId: z.string(),
  toolName: z.string().max(80),
  risk: RiskLevel,
  summary: z.string().max(8000),
  inputPreview: z.string().max(16000),
  inputHash: z.string().length(64),
  expiresAt: z.number().int(),
  allowedScopes: z.array(z.enum(["once", "session", "always"])),
  encVersion: z.literal(1).optional(),
})
  .refine((row) => row.encVersion === 1 || (row.summary.length <= 200 && row.inputPreview.length <= 4000), {
    message: "plaintext summary ≤ 200, inputPreview ≤ 4000",
  });

export const ApprovalDecision = z.object({
  approvalId: z.string().uuid(),
  decision: z.enum(["approved", "denied"]),
  inputHash: z.string().length(64),
  scope: z.enum(["once", "session", "always"]).default("once"),
});

export type RiskLevel = z.infer<typeof RiskLevel>;
export type ApprovalRequest = z.infer<typeof ApprovalRequest>;
export type ApprovalDecision = z.infer<typeof ApprovalDecision>;
