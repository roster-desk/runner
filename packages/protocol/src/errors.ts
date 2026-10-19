import { z } from "zod";

export const ErrorCode = z.enum([
  "unauthorized",
  "forbidden",
  "not_found",
  "validation_error",
  "rate_limited",
  "plan_limit",
  "runner_offline",
  "agent_unavailable",
  "turn_in_progress",
  "already_claimed",
  "pairing_expired",
  "approval_resolved",
  "approval_expired",
  "upgrade_required",
  "untrusted_hub",
]);

export type ErrorCode = z.infer<typeof ErrorCode>;

export const ErrorHttpStatus: Record<ErrorCode, number | null> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  validation_error: 400,
  rate_limited: 429,
  plan_limit: 402,
  runner_offline: 409,
  agent_unavailable: 409,
  turn_in_progress: 409,
  already_claimed: 409,
  pairing_expired: 410,
  approval_resolved: 409,
  approval_expired: 410,
  upgrade_required: 410,
  untrusted_hub: null,
};

export const ApiErrorBody = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
  }),
});
