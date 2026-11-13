import { z } from 'zod';

export const GeneratePixDtoSchema = z.object({
  orderId: z.string().min(1),
  tenantSlug: z.string().min(2),
  amountCents: z.number().int().positive('Valor do Pix deve ser positivo'),
  customerName: z.string().default('Cliente'),
  customerPhone: z.string().optional(),
});
export type GeneratePixDto = z.infer<typeof GeneratePixDtoSchema>;

export const SimulatePixPaymentDtoSchema = z.object({
  txid: z.string().min(5),
  orderId: z.string().min(1),
});
export type SimulatePixPaymentDto = z.infer<typeof SimulatePixPaymentDtoSchema>;
