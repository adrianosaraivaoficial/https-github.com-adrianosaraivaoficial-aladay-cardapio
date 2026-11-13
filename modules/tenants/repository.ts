import type { Pool } from 'pg';

export interface TenantEntity {
  id: string;
  name: string;
  slug: string;
  phone: string;
  address: string;
  subscriptionStatus: 'active' | 'trial' | 'past_due' | 'canceled';
  createdAt: string;
  evolutionInstanceId?: string;
  settings?: Record<string, any>;
}

export class TenantRepository {
  private inMemoryTenants: Map<string, TenantEntity> = new Map();

  constructor(private pool?: Pool | null) {
    // Seed default tenant
    const defaultTenant: TenantEntity = {
      id: 'tenant_brasas_01',
      name: 'Brasas Burger & Grill',
      slug: 'brasas-burger',
      phone: '11987654321',
      address: 'Av. Paulista, 1000 - São Paulo, SP',
      subscriptionStatus: 'active',
      createdAt: new Date().toISOString(),
      evolutionInstanceId: 'instancia_brasas_burger',
    };
    this.inMemoryTenants.set(defaultTenant.slug, defaultTenant);
  }

  async findBySlug(slug: string): Promise<TenantEntity | null> {
    const cleanSlug = slug.toLowerCase().trim();
    if (this.pool) {
      try {
        const res = await this.pool.query(
          'SELECT * FROM tenants WHERE LOWER(slug) = $1 LIMIT 1;',
          [cleanSlug],
        );
        if (res.rows[0]) {
          const row = res.rows[0];
          return {
            id: row.id,
            name: row.name,
            slug: row.slug,
            phone: row.phone || '',
            address: row.address || '',
            subscriptionStatus: row.subscription_status || 'trial',
            createdAt: row.created_at || new Date().toISOString(),
            evolutionInstanceId: row.evolution_instance_id,
            settings: row.settings || {},
          };
        }
      } catch {
        // fallback
      }
    }
    return this.inMemoryTenants.get(cleanSlug) || null;
  }

  async listAll(): Promise<TenantEntity[]> {
    if (this.pool) {
      try {
        const res = await this.pool.query('SELECT * FROM tenants ORDER BY created_at DESC;');
        if (res.rows.length > 0) {
          return res.rows.map((row) => ({
            id: row.id,
            name: row.name,
            slug: row.slug,
            phone: row.phone || '',
            address: row.address || '',
            subscriptionStatus: row.subscription_status || 'trial',
            createdAt: row.created_at || new Date().toISOString(),
            evolutionInstanceId: row.evolution_instance_id,
            settings: row.settings || {},
          }));
        }
      } catch {
        // fallback
      }
    }
    return Array.from(this.inMemoryTenants.values());
  }

  async save(tenant: TenantEntity): Promise<TenantEntity> {
    const cleanSlug = tenant.slug.toLowerCase().trim();
    this.inMemoryTenants.set(cleanSlug, tenant);
    if (this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO tenants (id, name, slug, phone, address, subscription_status, evolution_instance_id, settings, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (slug) DO UPDATE SET
             name = EXCLUDED.name,
             phone = EXCLUDED.phone,
             address = EXCLUDED.address,
             subscription_status = EXCLUDED.subscription_status,
             evolution_instance_id = EXCLUDED.evolution_instance_id,
             settings = EXCLUDED.settings;`,
          [
            tenant.id,
            tenant.name,
            cleanSlug,
            tenant.phone,
            tenant.address,
            tenant.subscriptionStatus,
            tenant.evolutionInstanceId || null,
            JSON.stringify(tenant.settings || {}),
            tenant.createdAt,
          ],
        );
      } catch {
        // fallback
      }
    }
    return tenant;
  }
}
