import { describe, it, expect } from 'vitest';
import { EvolutionWebhookDtoSchema, WebhookLogsQueryDtoSchema } from '../../modules/webhooks/validation.ts';
import { AsaasWebhookEventSchema } from '../../modules/billing/validation.ts';
import { WebhookService } from '../../modules/webhooks/service.ts';
import { WebhookRepository } from '../../modules/webhooks/repository.ts';

describe('Contract Tests: Webhook Payloads & PII Redaction', () => {
  const repo = new WebhookRepository();
  const service = new WebhookService(repo);

  it('validates Evolution API inbound message contract', () => {
    const validPayload = {
      event: 'messages.upsert',
      instance: 'instancia_brasas_burger',
      data: {
        key: {
          remoteJid: '5511987654321@s.whatsapp.net',
          fromMe: false,
          id: 'MSG_12345',
        },
        message: {
          conversation: 'Olá, gostaria de fazer um pedido!',
        },
      },
    };

    const parsed = EvolutionWebhookDtoSchema.parse(validPayload);
    expect(parsed.event).toBe('messages.upsert');
    expect(parsed.instance).toBe('instancia_brasas_burger');
  });

  it('validates Asaas payment received webhook contract', () => {
    const asaasPayload = {
      event: 'PAYMENT_RECEIVED',
      payment: {
        id: 'pay_123456789',
        customer: 'cus_000005',
        value: 99.0,
        status: 'RECEIVED',
        externalReference: 'brasas-burger',
      },
    };

    const parsed = AsaasWebhookEventSchema.parse(asaasPayload);
    expect(parsed.event).toBe('PAYMENT_RECEIVED');
    expect(parsed.payment?.externalReference).toBe('brasas-burger');
  });

  it('sanitizes sensitive data and tokens from webhook logs (Contractual PII Compliance)', () => {
    const sensitivePayload = {
      event: 'MESSAGES_UPSERT',
      instance: 'instancia_segura',
      data: {
        key: { remoteJid: '5511999998888@s.whatsapp.net' },
        message: { conversation: 'Minha senha secreta é 123456' },
      },
      headers: {
        apikey: 'SUPER_SECRET_EVOLUTION_API_KEY_123',
        authorization: 'Bearer secret_jwt_token_456',
      },
      password: 'plain_password',
    };

    const result = service.processEvolutionWebhook(sensitivePayload as any);
    expect(result.success).toBe(true);
    expect(result.data?.senderPhone).toContain('****'); // Redacted phone
    expect(result.data?.fullPayload.headers.apikey).toBe('[REDACTED]');
    expect(result.data?.fullPayload.headers.authorization).toBe('[REDACTED]');
    expect(result.data?.fullPayload.password).toBe('[REDACTED]');
  });
});
