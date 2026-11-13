import { z } from 'zod';

export const SendMessageDtoSchema = z.object({
  instance: z.string().min(2),
  number: z.string().min(8, 'Número de telefone do WhatsApp é obrigatório'),
  text: z.string().min(1, 'Texto da mensagem não pode ser vazio'),
  delayMs: z.number().int().nonnegative().optional().default(1000),
});
export type SendMessageDto = z.infer<typeof SendMessageDtoSchema>;

export const EvolutionConfigDtoSchema = z.object({
  evolutionApiUrl: z.string().url().optional(),
  evolutionApiKey: z.string().optional(),
  evolutionInstanceId: z.string().min(2),
});
export type EvolutionConfigDto = z.infer<typeof EvolutionConfigDtoSchema>;
