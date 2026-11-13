import { z } from 'zod';

export const AsaasSubscriptionDtoSchema = z.object({
  tenantSlug: z.string().min(2),
  customerName: z.string().min(2),
  customerEmail: z.string().email(),
  customerCpfCnpj: z.string().min(11),
  planId: z.enum(['starter', 'pro', 'enterprise']).default('pro'),
  billingType: z.enum(['PIX', 'CREDIT_CARD', 'BOLETO']).default('PIX'),
});
export type AsaasSubscriptionDto = z.infer<typeof AsaasSubscriptionDtoSchema>;

export const AsaasWebhookEventSchema = z.object({
  event: z.string(),
  payment: z.object({
    id: z.string(),
    customer: z.string(),
    value: z.number().optional(),
    status: z.string().optional(),
    externalReference: z.string().optional(),
  }).optional(),
});
export type AsaasWebhookEvent = z.infer<typeof AsaasWebhookEventSchema>;
