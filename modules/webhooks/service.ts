import type { WebhookRepository, SanitizedWebhookLog } from './repository.ts';
import type { EvolutionWebhookDto, WebhookLogsQueryDto } from './validation.ts';
import type { ServiceResult } from '../common/types.ts';

export class WebhookService {
  constructor(private repository: WebhookRepository) {}

  redactPhone(phone?: string): string {
    if (!phone) return 'N/D';
    const clean = phone.replace(/\D/g, '');
    if (clean.length < 8) return '***';
    return clean.slice(0, 4) + '****' + clean.slice(-2);
  }

  sanitizePayload(payload: any): any {
    if (!payload || typeof payload !== 'object') return payload;
    try {
      const copy = JSON.parse(JSON.stringify(payload));
      const sensitiveKeys = ['password', 'secret', 'apikey', 'authorization', 'token', 'cvv', 'cardnumber'];
      const scrub = (obj: any) => {
        if (!obj || typeof obj !== 'object') return;
        for (const k of Object.keys(obj)) {
          if (sensitiveKeys.some((s) => k.toLowerCase().includes(s))) {
            obj[k] = '[REDACTED]';
          } else if (typeof obj[k] === 'object') {
            scrub(obj[k]);
          }
        }
      };
      scrub(copy);
      return copy;
    } catch {
      return '[SANITIZATION_FAILED]';
    }
  }

  processEvolutionWebhook(dto: EvolutionWebhookDto): ServiceResult<SanitizedWebhookLog> {
    const data = (dto.data || {}) as Record<string, any>;
    const key = (data.key || {}) as Record<string, any>;
    const fromMe = key.fromMe === true;
    const isGroup = typeof key.remoteJid === 'string' && key.remoteJid.includes('@g.us');
    const rawCustomerPhone = typeof key.remoteJid === 'string' ? key.remoteJid.replace('@s.whatsapp.net', '') : 'Desconhecido';
    const customerPhone = this.redactPhone(rawCustomerPhone);
    const message = (data.message || {}) as Record<string, any>;
    const messageText = typeof message.conversation === 'string'
      ? message.conversation
      : typeof message.extendedTextMessage?.text === 'string'
        ? message.extendedTextMessage.text
        : '';

    const log: SanitizedWebhookLog = {
      id: `log_${Date.now()}`,
      timestamp: new Date().toLocaleTimeString('pt-BR'),
      source: 'evolution',
      eventType: dto.event || 'MESSAGES_UPSERT',
      instance: dto.instance || 'instancia_aladay',
      senderPhone: customerPhone,
      messageText: messageText.slice(0, 200),
      direction: 'inbound',
      status: fromMe || isGroup ? 'filtered' : 'success',
      payloadSummary: fromMe
        ? 'Mensagem enviada por mim (ignorada pelo bot)'
        : isGroup
          ? 'Mensagem em grupo (ignorada pelo bot)'
          : `Mensagem válida recebida de ${customerPhone}`,
      fullPayload: this.sanitizePayload(dto),
    };

    this.repository.addLog(log);
    return { success: true, data: log };
  }

  getLogs(query: WebhookLogsQueryDto, userTenantSlug?: string): ServiceResult<{ data: SanitizedWebhookLog[]; total: number }> {
    const logs = this.repository.getLogs(query.instance, userTenantSlug, query.limit);
    return {
      success: true,
      data: {
        data: logs,
        total: this.repository.count(),
      },
    };
  }
}
