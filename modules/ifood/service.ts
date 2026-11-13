import type { IfoodRepository, IfoodMerchantEntity } from './repository.ts';
import type { IfoodConfigDto } from './validation.ts';
import type { ServiceResult } from '../common/types.ts';

export class IfoodService {
  constructor(private repository: IfoodRepository) {}

  async saveConfig(tenantSlug: string, config: IfoodConfigDto): Promise<ServiceResult<IfoodMerchantEntity>> {
    const merchant: IfoodMerchantEntity = {
      tenantSlug,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      merchantId: config.merchantId,
      status: 'CONNECTED',
    };
    const saved = await this.repository.save(merchant);
    return { success: true, data: saved };
  }

  async getStatus(tenantSlug: string): Promise<ServiceResult<{ connected: boolean; merchantId?: string }>> {
    const merchant = await this.repository.findByTenantSlug(tenantSlug);
    if (!merchant || merchant.status !== 'CONNECTED') {
      return { success: true, data: { connected: false } };
    }
    return { success: true, data: { connected: true, merchantId: merchant.merchantId } };
  }
}
