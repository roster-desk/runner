import { z } from "zod";

export const QrPayloadV2 = z.object({
  v: z.literal(2),
  sid: z.string().uuid(),
  hub: z.string().url(),
  rpk: z.string(),
  rsk: z.string(),
  exp: z.number().int(),
});

export type QrPayloadV2 = z.infer<typeof QrPayloadV2>;
