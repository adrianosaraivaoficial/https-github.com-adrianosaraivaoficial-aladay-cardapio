import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { AuthRepository, UserEntity } from './repository.ts';
import type { AuthenticatedUser, ServiceResult } from '../common/types.ts';
import type { LoginDto, RegisterDto } from './validation.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'aladay_jwt_secret_dev_key_2026_super_safe_64chars_min_length_required';
const ISSUER = 'https://aladay.com.br';
const AUDIENCE = 'https://aladay.com.br';

export class AuthService {
  constructor(
    private repository: AuthRepository,
    private redisCoordinator?: {
      setSession: (key: string, data: any, ttlSec: number) => Promise<void>;
      getSession: <T>(key: string) => Promise<T | null>;
      deleteSession: (key: string) => Promise<void>;
      revokeSession: (sid: string, ttlSec?: number) => Promise<void>;
      isSessionRevoked: (sid: string) => boolean;
      isSessionRevokedAsync?: (sid: string) => Promise<boolean>;
    },
  ) {}

  hashPassword(password: string): string {
    return crypto.createHash('sha256').update(password.trim()).digest('hex');
  }

  signToken(user: AuthenticatedUser, existingSessionId?: string): { token: string; sessionId: string; claims: any } {
    const sessionId = existingSessionId || `sid_${crypto.randomBytes(16).toString('hex')}`;
    const claims = {
      sub: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      tenant_id: user.tenantId,
      tenant_slug: user.tenantSlug,
      permissions: user.permissions,
    };

    const token = jwt.sign(claims, JWT_SECRET, {
      algorithm: 'HS256',
      issuer: ISSUER,
      audience: AUDIENCE,
      expiresIn: '1h',
      jwtid: sessionId,
    });

    return { token, sessionId, claims: { ...claims, jti: sessionId } };
  }

  async verifyToken(token: string): Promise<any | null> {
    try {
      const decoded = jwt.verify(token, JWT_SECRET, {
        algorithms: ['HS256'],
        issuer: ISSUER,
        audience: AUDIENCE,
      }) as any;

      if (decoded.jti && this.redisCoordinator) {
        const isRevoked = this.redisCoordinator.isSessionRevokedAsync
          ? await this.redisCoordinator.isSessionRevokedAsync(decoded.jti)
          : this.redisCoordinator.isSessionRevoked(decoded.jti);
        if (isRevoked) return null;
      }

      return decoded;
    } catch {
      return null;
    }
  }

  async login(dto: LoginDto): Promise<ServiceResult<{ user: AuthenticatedUser; token: string; sessionId: string }>> {
    const user = await this.repository.findByEmail(dto.email);
    if (!user) {
      return { success: false, error: 'E-mail ou senha inválidos.', statusCode: 401 };
    }

    const hashed = this.hashPassword(dto.password);
    if (user.passwordHash !== hashed) {
      return { success: false, error: 'E-mail ou senha inválidos.', statusCode: 401 };
    }

    const { token, sessionId } = this.signToken(user);
    return {
      success: true,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          tenantId: user.tenantId,
          tenantSlug: user.tenantSlug,
          tenantName: user.tenantName,
          permissions: user.permissions,
        },
        token,
        sessionId,
      },
    };
  }

  async refreshSession(claims: any): Promise<ServiceResult<{ user: AuthenticatedUser; token: string; sessionId: string }>> {
    const user = await this.repository.findByEmail(claims.email || '');
    if (!user) {
      if (claims.jti && this.redisCoordinator) {
        await this.redisCoordinator.revokeSession(claims.jti);
      }
      return { success: false, error: 'Sessão revogada: usuário inexistente.', statusCode: 401 };
    }

    // Invalidate old session ID
    if (claims.jti && this.redisCoordinator) {
      await this.redisCoordinator.revokeSession(claims.jti);
    }

    // Issue new session ID and short-lived token
    const { token, sessionId } = this.signToken(user);
    return {
      success: true,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          tenantId: user.tenantId,
          tenantSlug: user.tenantSlug,
          tenantName: user.tenantName,
          permissions: user.permissions,
        },
        token,
        sessionId,
      },
    };
  }

  async logout(sessionId?: string): Promise<void> {
    if (sessionId && this.redisCoordinator) {
      await this.redisCoordinator.revokeSession(sessionId);
    }
  }
}
