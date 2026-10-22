import { z } from "zod";

const id = z.string().regex(/^[a-z0-9-]{2,40}$/);

export const AgentFile = z.object({
  version: z.literal(1),
  agents: z.array(
    z.object({
      id,
      name: z.string().min(1).max(40),
      description: z.string().max(200).default(""),
      adapter: z.enum(["echo", "command", "claude-agent-sdk", "http"]),
      capabilities: z.array(z.string()).default([]),
      options: z.record(z.unknown()).default({}),
      policy: z.string().min(1),
    }),
  ),
});

const rule = z.object({
  match: z.object({
    tool: z.string().min(1),
    inputContains: z.array(z.string()).optional(),
  }),
  action: z.enum(["allow", "ask", "deny"]),
  risk: z.enum(["low", "medium", "high"]).default("medium"),
});

export const PolicyFile = z.object({
  version: z.literal(1),
  profiles: z.record(
    z.object({
      default: z.enum(["allow", "ask", "deny"]),
      rules: z.array(rule).default([]),
    }),
  ),
  granted: z
    .array(
      z.object({
        agent: z.string().min(1),
        tool: z.string().min(1),
        addedAt: z.string().min(1),
        from: z.enum(["phone", "pc"]),
      }),
    )
    .default([]),
});

export type AgentFile = z.infer<typeof AgentFile>;
export type PolicyFile = z.infer<typeof PolicyFile>;
