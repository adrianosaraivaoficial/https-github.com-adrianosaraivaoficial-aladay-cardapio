import type { TenantRepository, TenantEntity } from './repository.ts';
import type { CreateTenantDto, UpdateTenantDto } from './validation.ts';
import type { ServiceResult } from '../common/types.ts';

export class TenantService {
  constructor(private repository: TenantRepository) {}

  async getTenantBySlug(slug: string): Promise<ServiceResult<TenantEntity>> {
    const tenant = await this.repository.findBySlug(slug);
    if (!tenant) {
      return { success: false, error: 'Restaurante não encontrado.', statusCode: 404 };
    }
    return { success: true, data: tenant };
  }

  async getAllTenants(): Promise<ServiceResult<TenantEntity[]>> {
    const list = await this.repository.listAll();
    return { success: true, data: list };
  }

  async createTenant(dto: CreateTenantDto): Promise<ServiceResult<TenantEntity>> {
    const existing = await this.repository.findBySlug(dto.slug);
    if (existing) {
      return { success: false, error: 'Já existe um restaurante cadastrado com esse link/slug.', statusCode: 409 };
    }

    const newTenant: TenantEntity = {
      id: `tenant_${Date.now()}`,
      name: dto.name,
      slug: dto.slug.toLowerCase().trim(),
      phone: dto.phone || '',
      address: dto.address || '',
      subscriptionStatus: dto.subscriptionStatus || 'trial',
      createdAt: new Date().toISOString(),
      evolutionInstanceId: dto.evolutionInstanceId || `instancia_${dto.slug.toLowerCase().trim()}`,
    };

    const saved = await this.repository.save(newTenant);
    return { success: true, data: saved, statusCode: 201 };
  }

  async updateTenant(slug: string, dto: UpdateTenantDto): Promise<ServiceResult<TenantEntity>> {
    const existing = await this.repository.findBySlug(slug);
    if (!existing) {
      return { success: false, error: 'Restaurante não encontrado.', statusCode: 404 };
    }

    const updated: TenantEntity = {
      ...existing,
      ...dto,
      slug: existing.slug, // Maintain slug stability
    };

    const saved = await this.repository.save(updated);
    return { success: true, data: saved };
  }
}
