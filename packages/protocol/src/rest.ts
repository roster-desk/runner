import { z } from "zod";
import { ApprovalDecision } from "./approval.js";

const uuid = z.string().uuid();

export const GuestAuthRequest = z.object({
  displayName: z.string().min(1).max(40),
  avatarKey: z.string().min(1).max(32).optional(),
  locale: z.string().optional(),
});

export const DeviceRegisterRequest = z.object({
  platform: z.string().min(1),
  name: z.string().min(1),
  boxPub: z.string().min(1),
  pushToken: z.string().optional(),
});

export const PairingClaimRequest = z.object({
  sessionId: uuid,
  deviceId: uuid,
});

export const SendMessageRequest = z.object({
  clientId: uuid,
  text: z.string().min(1),
});

export const MessageV2 = z.object({
  id: uuid,
  conversationId: uuid,
  turnId: uuid.nullable().optional(),
  seq: z.number().int(),
  clientId: uuid,
  sender: z.enum(["USER", "AGENT", "SYSTEM"]),
  kind: z.enum(["TEXT", "STATUS", "TOOL", "APPROVAL", "ERROR"]),
  body: z.string(),
  encVersion: z.number().int().nullable().optional(),
  createdAt: z.string(),
});

export const SseEvent = z.discriminatedUnion("event", [
  z.object({
    id: z.number().int(),
    event: z.literal("runner.presence"),
    data: z.object({ runnerId: uuid, online: z.boolean(), lastSeenAt: z.string() }),
  }),
  z.object({
    id: z.number().int(),
    event: z.literal("catalog.updated"),
    data: z.object({ runnerId: uuid }),
  }),
  z.object({
    id: z.number().int(),
    event: z.literal("turn.status"),
    data: z.object({
      turnId: uuid,
      conversationId: uuid,
      state: z.enum(["running", "awaiting_approval", "done", "error", "cancelled"]),
      label: z.string().optional(),
    }),
  }),
  z.object({
    event: z.literal("message.delta"),
    data: z.object({ turnId: uuid, conversationId: uuid, text: z.string() }),
  }),
  z.object({
    id: z.number().int(),
    event: z.literal("message.created"),
    data: MessageV2,
  }),
  z.object({
    id: z.number().int(),
    event: z.literal("approval.requested"),
    data: z.object({
      approvalId: uuid,
      toolName: z.string(),
      risk: z.enum(["low", "medium", "high"]),
      summary: z.string(),
    }),
  }),
  z.object({
    id: z.number().int(),
    event: z.literal("approval.resolved"),
    data: z.object({
      approvalId: uuid,
      status: z.enum(["PENDING", "APPROVED", "DENIED", "EXPIRED", "CANCELLED"]),
      decidedByDeviceId: uuid,
    }),
  }),
  z.object({
    id: z.number().int(),
    event: z.literal("pairing.updated"),
    data: z.object({ sessionId: uuid, status: z.string() }),
  }),
  z.object({
    id: z.number().int(),
    event: z.literal("runner.revoked"),
    data: z.object({ runnerId: uuid }),
  }),
]);

export const ApprovalDecisionRequest = ApprovalDecision;
