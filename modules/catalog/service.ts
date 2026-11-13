import type { CatalogRepository } from './repository.ts';
import type { CategoryDto, ProductDto, CatalogPartitionDto } from './validation.ts';
import type { ServiceResult } from '../common/types.ts';

export class CatalogService {
  constructor(private repository: CatalogRepository) {}

  async getCatalog(tenantSlug: string): Promise<ServiceResult<{ categories: CategoryDto[]; products: ProductDto[] }>> {
    const data = await this.repository.getCatalog(tenantSlug);
    return { success: true, data };
  }

  async savePartition(dto: CatalogPartitionDto): Promise<ServiceResult<{ success: boolean; itemCount: number }>> {
    await this.repository.saveCatalog(dto.tenantSlug, dto.categories, dto.products);
    return {
      success: true,
      data: {
        success: true,
        itemCount: dto.products.length,
      },
    };
  }

  calculateTotalCents(items: { priceCents: number; quantity: number }[]): number {
    return items.reduce((sum, item) => sum + Math.max(0, item.priceCents) * Math.max(0, item.quantity), 0);
  }
}
