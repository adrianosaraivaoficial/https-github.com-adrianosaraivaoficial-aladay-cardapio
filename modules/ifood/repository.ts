import type { Pool } from 'pg';

export interface IfoodMerchantEntity {
  tenantSlug: string;
  clientId: string;
  clientSecret: string;
  merchantId: string;
  accessToken?: string;
  expiresAt?: number;
  status: 'CONNECTED' | 'DISCONNECTED';
}

export class IfoodRepository {
  private inMemoryMerchants: Map<string, IfoodMerchantEntity> = new Map();

  constructor(private pool?: Pool | null) {}

  async findByTenantSlug(slug: string): Promise<IfoodMerchantEntity | null> {
    const clean = slug.toLowerCase().trim();
    if (this.pool) {
      try {
        const res = await this.pool.query(
          'SELECT * FROM ifood_merchants WHERE tenant_slug = $1 LIMIT 1;',
          [clean],
        );
        if (res.rows[0]) {
          const r = res.rows[0];
          return {
            tenantSlug: r.tenant_slug,
            clientId: r.client_id,
            clientSecret: r.client_secret,
            merchantId: r.merchant_id,
            status: r.status,
          };
        }
      } catch {
        // fallback
      }
    }
    return this.inMemoryMerchants.get(clean) || null;
  }

  async save(merchant: IfoodMerchantEntity): Promise<IfoodMerchantEntity> {
    const clean = merchant.tenantSlug.toLowerCase().trim();
    this.inMemoryMerchants.set(clean, merchant);
    return merchant;
  }
}
