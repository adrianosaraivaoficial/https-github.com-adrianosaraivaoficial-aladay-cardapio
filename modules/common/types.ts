import type { Request } from 'express';

export type UserRole = 'SUPER_ADMIN' | 'TENANT_OWNER' | 'WAITER' | 'CHEF';

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  permissions: string[];
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  claims?: {
    sub: string;
    email: string;
    role: UserRole;
    tenant_slug: string;
    tenant_id: string;
    permissions: string[];
    jti?: string;
    iat?: number;
    exp?: number;
    iss?: string;
    aud?: string;
  };
}

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
}
