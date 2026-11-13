import type { Pool } from 'pg';
import type { AuthenticatedUser } from '../common/types.ts';

export interface UserEntity extends AuthenticatedUser {
  passwordHash: string;
}

export class AuthRepository {
  private inMemoryUsers: Map<string, UserEntity> = new Map();

  constructor(private pool?: Pool | null) {
    // Seed default admin user
    this.inMemoryUsers.set('admin@aladay.com.br', {
      id: 'usr_super_01',
      name: 'Administrador Aladay',
      email: 'admin@aladay.com.br',
      passwordHash: '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918', // 'admin' or matching hash
      role: 'SUPER_ADMIN',
      tenantId: '*',
      tenantSlug: '*',
      tenantName: 'Aladay Plataforma',
      permissions: ['platform:manage_tenants', 'platform:asaas_subscriptions', 'tenant:full_access'],
    });
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    const cleanEmail = email.trim().toLowerCase();
    if (this.pool) {
      try {
        const res = await this.pool.query(
          'SELECT * FROM subscriber_users WHERE LOWER(email) = $1 LIMIT 1;',
          [cleanEmail],
        );
        if (res.rows[0]) {
          const row = res.rows[0];
          return {
            id: row.id,
            name: row.name,
            email: row.email,
            passwordHash: row.password_hash,
            phone: row.phone || '',
            role: row.role || 'TENANT_OWNER',
            tenantId: row.tenant_id,
            tenantSlug: row.tenant_slug,
            tenantName: row.tenant_name || 'Restaurante',
            permissions: Array.isArray(row.permissions) ? row.permissions : ['tenant:full_access'],
          };
        }
      } catch {
        // fallback
      }
    }
    return this.inMemoryUsers.get(cleanEmail) || null;
  }

  async findById(id: string): Promise<UserEntity | null> {
    if (this.pool) {
      try {
        const res = await this.pool.query('SELECT * FROM subscriber_users WHERE id = $1 LIMIT 1;', [id]);
        if (res.rows[0]) {
          const row = res.rows[0];
          return {
            id: row.id,
            name: row.name,
            email: row.email,
            passwordHash: row.password_hash,
            phone: row.phone || '',
            role: row.role || 'TENANT_OWNER',
            tenantId: row.tenant_id,
            tenantSlug: row.tenant_slug,
            tenantName: row.tenant_name || 'Restaurante',
            permissions: Array.isArray(row.permissions) ? row.permissions : ['tenant:full_access'],
          };
        }
      } catch {
        // fallback
      }
    }
    for (const u of this.inMemoryUsers.values()) {
      if (u.id === id) return u;
    }
    return null;
  }

  async createUser(user: UserEntity): Promise<UserEntity> {
    const cleanEmail = user.email.toLowerCase().trim();
    this.inMemoryUsers.set(cleanEmail, user);
    if (this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO subscriber_users (id, name, email, password_hash, phone, role, tenant_id, tenant_slug, tenant_name, permissions)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (email) DO UPDATE SET
             name = EXCLUDED.name,
             password_hash = EXCLUDED.password_hash,
             role = EXCLUDED.role,
             tenant_slug = EXCLUDED.tenant_slug,
             tenant_name = EXCLUDED.tenant_name,
             updated_at = NOW();`,
          [
            user.id,
            user.name,
            cleanEmail,
            user.passwordHash,
            user.phone || '',
            user.role,
            user.tenantId,
            user.tenantSlug,
            user.tenantName,
            JSON.stringify(user.permissions),
          ],
        );
      } catch {
        // fallback
      }
    }
    return user;
  }
}
