import { z } from 'zod';

export const IfoodConfigDtoSchema = z.object({
  clientId: z.string().min(5),
  clientSecret: z.string().min(5),
  merchantId: z.string().min(5),
});
export type IfoodConfigDto = z.infer<typeof IfoodConfigDtoSchema>;

export const IfoodEventDtoSchema = z.object({
  id: z.string(),
  code: z.string(),
  orderId: z.string(),
  createdAt: z.string(),
});
export type IfoodEventDto = z.infer<typeof IfoodEventDtoSchema>;
