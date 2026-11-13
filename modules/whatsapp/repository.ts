import type { Pool } from 'pg';
import type { EvolutionConfigDto } from './validation.ts';

export interface WhatsAppInstanceEntity {
  tenantSlug: string;
  instanceName: string;
  apiUrl: string;
  apiKey: string;
  status: 'CONNECTED' | 'DISCONNECTED' | 'PAIRING';
  updatedAt: string;
}

export class WhatsAppRepository {
  private inMemoryInstances: Map<string, WhatsAppInstanceEntity> = new Map();

  constructor(private pool?: Pool | null) {
    this.inMemoryInstances.set('brasas-burger', {
      tenantSlug: 'brasas-burger',
      instanceName: 'instancia_brasas_burger',
      apiUrl: process.env.EVOLUTION_API_URL || 'https://agencia-evolution-api.2eoc7n.easypanel.host',
      apiKey: process.env.EVOLUTION_API_KEY || '',
      status: 'CONNECTED',
      updatedAt: new Date().toISOString(),
    });
  }

  async findByTenantSlug(slug: string): Promise<WhatsAppInstanceEntity | null> {
    const clean = slug.toLowerCase().trim();
    if (this.pool) {
      try {
        const res = await this.pool.query(
          'SELECT * FROM whatsapp_instances WHERE tenant_slug = $1 LIMIT 1;',
          [clean],
        );
        if (res.rows[0]) {
          const r = res.rows[0];
          return {
            tenantSlug: r.tenant_slug,
            instanceName: r.instance_name,
            apiUrl: r.api_url,
            apiKey: r.api_key,
            status: r.status,
            updatedAt: r.updated_at,
          };
        }
      } catch {
        // fallback
      }
    }
    return this.inMemoryInstances.get(clean) || null;
  }

  async saveConfig(slug: string, config: EvolutionConfigDto): Promise<WhatsAppInstanceEntity> {
    const clean = slug.toLowerCase().trim();
    const entity: WhatsAppInstanceEntity = {
      tenantSlug: clean,
      instanceName: config.evolutionInstanceId,
      apiUrl: config.evolutionApiUrl || process.env.EVOLUTION_API_URL || 'https://agencia-evolution-api.2eoc7n.easypanel.host',
      apiKey: config.evolutionApiKey || process.env.EVOLUTION_API_KEY || '',
      status: 'CONNECTED',
      updatedAt: new Date().toISOString(),
    };
    this.inMemoryInstances.set(clean, entity);
    return entity;
  }
}
