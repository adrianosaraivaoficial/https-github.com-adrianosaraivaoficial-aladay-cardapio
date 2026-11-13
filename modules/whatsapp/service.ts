import type { WhatsAppRepository, WhatsAppInstanceEntity } from './repository.ts';
import type { SendMessageDto, EvolutionConfigDto } from './validation.ts';
import type { ServiceResult } from '../common/types.ts';

export class WhatsAppService {
  constructor(private repository: WhatsAppRepository) {}

  redactPhone(phone?: string): string {
    if (!phone) return 'N/D';
    const clean = phone.replace(/\D/g, '');
    if (clean.length < 8) return '***';
    return clean.slice(0, 4) + '****' + clean.slice(-2);
  }

  async sendMessage(dto: SendMessageDto): Promise<ServiceResult<{ delivered: boolean; recipient: string }>> {
    const cleanPhone = dto.number.replace(/\D/g, '');
    const instance = await this.repository.findByTenantSlug(dto.instance.replace('instancia_', ''));
    const apiUrl = instance?.apiUrl || process.env.EVOLUTION_API_URL || 'https://agencia-evolution-api.2eoc7n.easypanel.host';
    const apiKey = instance?.apiKey || process.env.EVOLUTION_API_KEY || '';

    let delivered = false;
    if (apiKey) {
      try {
        const res = await fetch(`${apiUrl.replace(/\/$/, '')}/message/sendText/${dto.instance}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: apiKey,
          },
          body: JSON.stringify({
            number: cleanPhone,
            text: dto.text,
            options: { delay: dto.delayMs || 1000, presence: 'composing', linkPreview: true },
          }),
        });
        delivered = res.ok;
      } catch {
        delivered = false;
      }
    }

    return {
      success: true,
      data: {
        delivered,
        recipient: this.redactPhone(cleanPhone),
      },
    };
  }

  async saveEvolutionConfig(tenantSlug: string, config: EvolutionConfigDto): Promise<ServiceResult<WhatsAppInstanceEntity>> {
    const saved = await this.repository.saveConfig(tenantSlug, config);
    return { success: true, data: saved };
  }
}
