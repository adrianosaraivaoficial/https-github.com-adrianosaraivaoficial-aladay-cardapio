import { z } from 'zod';

export const LoginDtoSchema = z.object({
  email: z.string().trim().email('E-mail informado é inválido'),
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
});
export type LoginDto = z.infer<typeof LoginDtoSchema>;

export const RegisterDtoSchema = z.object({
  name: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  email: z.string().trim().email('E-mail inválido'),
  password: z.string().min(6, 'Senha deve conter pelo menos 6 caracteres'),
  tenantName: z.string().trim().min(2, 'Nome do restaurante deve conter pelo menos 2 caracteres'),
  phone: z.string().trim().optional(),
});
export type RegisterDto = z.infer<typeof RegisterDtoSchema>;

export const OtpRequestDtoSchema = z.object({
  email: z.string().trim().email('E-mail cadastrado inválido'),
  phone: z.string().min(8, 'Número de WhatsApp é obrigatório'),
});
export type OtpRequestDto = z.infer<typeof OtpRequestDtoSchema>;

export const OtpVerifyDtoSchema = z.object({
  email: z.string().trim().email('E-mail inválido'),
  code: z.string().regex(/^\d{6}$/, 'Código OTP deve conter exatamente 6 dígitos numéricos'),
});
export type OtpVerifyDto = z.infer<typeof OtpVerifyDtoSchema>;
