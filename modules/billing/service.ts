import type { BillingRepository, BillingSubscriptionEntity } from './repository.ts';
import type { AsaasSubscriptionDto, AsaasWebhookEvent } from './validation.ts';
import type { ServiceResult } from '../common/types.ts';

export class BillingService {
  constructor(private repository: BillingRepository) {}

  isTrialExpired(createdAtIso: string, trialDays = 15): { expired: boolean; daysRemaining: number } {
    const createdMs = new Date(createdAtIso).getTime();
    const nowMs = Date.now();
    const trialDurationMs = trialDays * 24 * 60 * 60 * 1000;
    const expiresMs = createdMs + trialDurationMs;
    const remainingMs = expiresMs - nowMs;

    return {
      expired: remainingMs <= 0,
      daysRemaining: Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000))),
    };
  }

  async getSubscription(tenantSlug: string): Promise<ServiceResult<BillingSubscriptionEntity>> {
    const sub = await this.repository.findByTenantSlug(tenantSlug);
    if (!sub) {
      // Default trial subscription
      const trialEnds = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();
      const newSub: BillingSubscriptionEntity = {
        id: `sub_${Date.now()}`,
        tenantSlug,
        asaasCustomerId: `cus_trial_${tenantSlug}`,
        asaasSubscriptionId: `sub_trial_${tenantSlug}`,
        status: 'PENDING',
        planId: 'pro',
        trialEndsAt: trialEnds,
        updatedAt: new Date().toISOString(),
      };
      await this.repository.save(newSub);
      return { success: true, data: newSub };
    }
    return { success: true, data: sub };
  }

  async processWebhook(event: AsaasWebhookEvent): Promise<ServiceResult<{ handled: boolean }>> {
    if (event.payment?.externalReference) {
      const tenantSlug = event.payment.externalReference;
      const sub = await this.repository.findByTenantSlug(tenantSlug);
      if (sub && (event.event === 'PAYMENT_RECEIVED' || event.event === 'PAYMENT_CONFIRMED')) {
        sub.status = 'ACTIVE';
        sub.updatedAt = new Date().toISOString();
        await this.repository.save(sub);
      }
    }
    return { success: true, data: { handled: true } };
  }
}
