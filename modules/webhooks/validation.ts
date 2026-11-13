import { z } from 'zod';

export const EvolutionWebhookDtoSchema = z.object({
  event: z.string().optional().default('MESSAGES_UPSERT'),
  instance: z.string().optional(),
  data: z.record(z.string(), z.any()).optional(),
});
export type EvolutionWebhookDto = z.infer<typeof EvolutionWebhookDtoSchema>;

export const WebhookLogsQueryDtoSchema = z.object({
  instance: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).optional().default(30),
});
export type WebhookLogsQueryDto = z.infer<typeof WebhookLogsQueryDtoSchema>;
