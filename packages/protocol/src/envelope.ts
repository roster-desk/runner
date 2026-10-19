import { z } from "zod";

export const WsEnvelope = z.object({
  v: z.literal(2),
  id: z.string().uuid(),
  type: z.string(),
  ts: z.number().int(),
  corr: z.string().uuid().optional(),
  data: z.record(z.unknown()),
});

export type WsEnvelope = z.infer<typeof WsEnvelope>;
