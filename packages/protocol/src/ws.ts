import { z } from "zod";
import { ApprovalRequest } from "./approval.js";
import { QrPayloadV2 } from "./qr.js";

const uuid = z.string().uuid();

export const AgentDescriptor = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  capabilities: z.array(z.string()).optional(),
});

export const RunnerToHub = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("hello"),
    data: z.object({ runnerVersion: z.string(), os: z.string(), deviceName: z.string() }),
  }),
  z.object({
    type: z.literal("pair.offer"),
    data: z.object({ signPub: z.string(), boxPub: z.string(), deviceName: z.string(), os: z.string() }),
  }),
  z.object({
    type: z.literal("pair.decision"),
    data: z.object({ sessionId: uuid, decision: z.enum(["allow", "reject"]) }),
  }),
  z.object({
    type: z.literal("auth.proof"),
    data: z.object({ runnerId: uuid, nonce: z.string(), sig: z.string() }),
  }),
  z.object({
    type: z.literal("catalog.sync"),
    data: z.object({ agents: z.array(AgentDescriptor) }),
  }),
  z.object({
    type: z.literal("turn.status"),
    data: z.object({
      turnId: uuid,
      conversationId: uuid,
      state: z.enum(["running", "awaiting_approval", "done", "error", "cancelled"]),
      label: z.string().optional(),
    }),
  }),
  z.object({
    type: z.literal("message.delta"),
    data: z.object({ turnId: uuid, conversationId: uuid, text: z.string() }),
  }),
  z.object({
    type: z.literal("message.final"),
    data: z.object({
      turnId: uuid,
      conversationId: uuid,
      clientId: uuid,
      text: z.string(),
      kind: z.enum(["text", "status", "tool", "approval", "error"]),
    }),
  }),
  z.object({
    type: z.literal("tool.event"),
    data: z.object({
      turnId: uuid,
      conversationId: uuid,
      toolName: z.string(),
      phase: z.enum(["started", "finished", "failed"]),
      summary: z.string(),
    }),
  }),
  z.object({ type: z.literal("approval.request"), data: ApprovalRequest }),
  z.object({
    type: z.literal("approval.applied"),
    data: z.object({
      approvalId: uuid,
      outcome: z.enum(["executed", "skipped", "expired", "hash_mismatch"]),
    }),
  }),
  z.object({
    type: z.literal("turn.rejected"),
    data: z.object({
      turnId: uuid,
      conversationId: uuid,
      reason: z.enum(["agent_unavailable", "turn_in_progress"]),
    }),
  }),
  z.object({ type: z.literal("heartbeat"), data: z.object({}).strict() }),
]);

export const HubToRunner = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("pair.qr"),
    data: z.object({ sessionId: uuid, qr: QrPayloadV2, expiresAt: z.number().int() }),
  }),
  z.object({
    type: z.literal("pair.confirm_request"),
    data: z.object({
      sessionId: uuid,
      claimer: z.object({ displayName: z.string() }),
      phoneBoxPub: z.string(),
    }),
  }),
  z.object({ type: z.literal("pair.bound"), data: z.object({ runnerId: uuid }) }),
  z.object({ type: z.literal("pair.rejected"), data: z.object({ sessionId: uuid }) }),
  z.object({ type: z.literal("pair.expired"), data: z.object({ sessionId: uuid }) }),
  z.object({ type: z.literal("auth.challenge"), data: z.object({ nonce: z.string() }) }),
  z.object({
    type: z.literal("auth.ok"),
    data: z.object({ runnerId: uuid, resumeFrom: z.number().int().optional() }),
  }),
  z.object({
    type: z.literal("auth.fail"),
    data: z.object({ code: z.enum(["revoked", "unknown_runner", "bad_signature"]) }),
  }),
  z.object({
    type: z.literal("turn.start"),
    data: z.object({
      turnId: uuid,
      conversationId: uuid,
      agentId: z.string(),
      clientId: uuid,
      text: z.string(),
      sessionKey: z.string(),
    }),
  }),
  z.object({ type: z.literal("turn.cancel"), data: z.object({ turnId: uuid }) }),
  z.object({
    type: z.literal("approval.decision"),
    data: z.object({
      approvalId: uuid,
      decision: z.enum(["approved", "denied"]),
      inputHash: z.string().length(64),
      scope: z.enum(["once", "session", "always"]),
      decidedAt: z.number().int(),
    }),
  }),
  z.object({ type: z.literal("runner.revoked"), data: z.object({}).strict() }),
]);

export const JsonlToAgent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("hello"), protocol: z.literal(1), agentId: z.string() }),
  z.object({ type: z.literal("turn"), turnId: z.string(), sessionKey: z.string(), text: z.string() }),
  z.object({
    type: z.literal("approval.result"),
    requestId: z.string(),
    decision: z.enum(["approved", "denied"]),
  }),
  z.object({ type: z.literal("cancel"), turnId: z.string() }),
]);

export const JsonlFromAgent = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ready"),
    name: z.string(),
    capabilities: z.array(z.string()),
  }),
  z.object({ type: z.literal("status"), turnId: z.string(), label: z.string() }),
  z.object({ type: z.literal("delta"), turnId: z.string(), text: z.string() }),
  z.object({
    type: z.literal("tool"),
    turnId: z.string(),
    toolName: z.string(),
    phase: z.enum(["started", "finished", "failed"]),
    summary: z.string(),
  }),
  z.object({
    type: z.literal("approval.request"),
    turnId: z.string(),
    requestId: z.string(),
    toolName: z.string(),
    input: z.record(z.unknown()),
    summary: z.string(),
  }),
  z.object({ type: z.literal("final"), turnId: z.string(), text: z.string() }),
  z.object({ type: z.literal("error"), turnId: z.string(), code: z.string(), message: z.string() }),
]);
