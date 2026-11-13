import { z } from 'zod';

export const TenantSlugSchema = z.string()
  .min(2, 'Slug deve ter pelo menos 2 caracteres')
  .max(64, 'Slug não pode exceder 64 caracteres')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug deve conter apenas letras minúsculas, números e hífens');

export const CreateTenantDtoSchema = z.object({
  name: z.string().trim().min(2, 'Nome do restaurante deve ter pelo menos 2 caracteres'),
  slug: TenantSlugSchema,
  phone: z.string().optional().default(''),
  address: z.string().optional().default(''),
  subscriptionStatus: z.enum(['active', 'trial', 'past_due', 'canceled']).default('trial'),
  evolutionInstanceId: z.string().optional(),
});
export type CreateTenantDto = z.infer<typeof CreateTenantDtoSchema>;

export const UpdateTenantDtoSchema = CreateTenantDtoSchema.partial().extend({
  slug: TenantSlugSchema.optional(),
});
export type UpdateTenantDto = z.infer<typeof UpdateTenantDtoSchema>;
