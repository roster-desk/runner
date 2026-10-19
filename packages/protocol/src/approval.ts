import { z } from "zod";

export const RiskLevel = z.enum(["low", "medium", "high"]);

export const ApprovalRequest = z.object({
  approvalId: z.string().uuid(),
  turnId: z.string().uuid(),
  conversationId: z.string().uuid(),
  agentId: z.string(),
  toolName: z.string().max(80),
  risk: RiskLevel,
  summary: z.string().max(200),
  inputPreview: z.string().max(4000),
  inputHash: z.string().length(64),
  expiresAt: z.number().int(),
  allowedScopes: z.array(z.enum(["once", "session", "always"])),
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
