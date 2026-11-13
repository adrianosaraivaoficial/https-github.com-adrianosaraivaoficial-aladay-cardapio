import type { Pool } from 'pg';

export interface BillingSubscriptionEntity {
  id: string;
  tenantSlug: string;
  asaasCustomerId: string;
  asaasSubscriptionId: string;
  status: 'ACTIVE' | 'PENDING' | 'OVERDUE' | 'CANCELLED';
  planId: string;
  trialEndsAt: string;
  updatedAt: string;
}

export class BillingRepository {
  private inMemorySubs: Map<string, BillingSubscriptionEntity> = new Map();

  constructor(private pool?: Pool | null) {}

  async findByTenantSlug(slug: string): Promise<BillingSubscriptionEntity | null> {
    const clean = slug.toLowerCase().trim();
    if (this.pool) {
      try {
        const res = await this.pool.query(
          'SELECT * FROM billing_subscriptions WHERE LOWER(tenant_slug) = $1 LIMIT 1;',
          [clean],
        );
        if (res.rows[0]) {
          const r = res.rows[0];
          return {
            id: r.id,
            tenantSlug: r.tenant_slug,
            asaasCustomerId: r.asaas_customer_id,
            asaasSubscriptionId: r.asaas_subscription_id,
            status: r.status,
            planId: r.plan_id,
            trialEndsAt: r.trial_ends_at,
            updatedAt: r.updated_at,
          };
        }
      } catch {
        // fallback
      }
    }
    return this.inMemorySubs.get(clean) || null;
  }

  async save(sub: BillingSubscriptionEntity): Promise<BillingSubscriptionEntity> {
    const clean = sub.tenantSlug.toLowerCase().trim();
    this.inMemorySubs.set(clean, sub);
    if (this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO billing_subscriptions (id, tenant_slug, asaas_customer_id, asaas_subscription_id, status, plan_id, trial_ends_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (tenant_slug) DO UPDATE SET
             status = EXCLUDED.status,
             plan_id = EXCLUDED.plan_id,
             updated_at = EXCLUDED.updated_at;`,
          [
            sub.id,
            clean,
            sub.asaasCustomerId,
            sub.asaasSubscriptionId,
            sub.status,
            sub.planId,
            sub.trialEndsAt,
            sub.updatedAt,
          ],
        );
      } catch {
        // fallback
      }
    }
    return sub;
  }
}
