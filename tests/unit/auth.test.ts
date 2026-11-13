import { describe, it, expect } from 'vitest';
import { AuthService } from '../../modules/auth/service.ts';
import { AuthRepository } from '../../modules/auth/repository.ts';

describe('Unit Tests: Authentication, JWT & Session Revocation', () => {
  const repository = new AuthRepository(null);
  const revokedSids = new Set<string>();
  const mockRedis = {
    setSession: async () => {},
    getSession: async () => null,
    deleteSession: async () => {},
    revokeSession: async (sid: string) => {
      revokedSids.add(sid);
    },
    isSessionRevoked: (sid: string) => revokedSids.has(sid),
    isSessionRevokedAsync: async (sid: string) => revokedSids.has(sid),
  };
  const authService = new AuthService(repository, mockRedis);

  it('hashes passwords consistently with SHA-256', () => {
    const hash1 = authService.hashPassword('secretPassword123');
    const hash2 = authService.hashPassword('secretPassword123');
    const hashOther = authService.hashPassword('differentPassword');

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hashOther);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('signs and verifies JWT with standard algorithms and claims', async () => {
    const user = {
      id: 'usr_unit_test',
      name: 'Tester Aladay',
      email: 'tester@aladay.com.br',
      role: 'TENANT_OWNER' as const,
      tenantId: 'tenant_test',
      tenantSlug: 'test-grill',
      tenantName: 'Test Grill',
      permissions: ['tenant:full_access'],
    };

    const { token, sessionId, claims } = authService.signToken(user);

    expect(token).toBeDefined();
    expect(sessionId).toMatch(/^sid_/);
    expect(claims.jti).toBe(sessionId);

    const verified = await authService.verifyToken(token);
    expect(verified).not.toBeNull();
    expect(verified.sub).toBe('usr_unit_test');
    expect(verified.email).toBe('tester@aladay.com.br');
    expect(verified.iss).toBe('https://aladay.com.br');
    expect(verified.aud).toBe('https://aladay.com.br');
    expect(verified.jti).toBe(sessionId);
  });

  it('rejects revoked sessions immediately', async () => {
    const user = {
      id: 'usr_unit_test',
      name: 'Tester Revoke',
      email: 'revoke@aladay.com.br',
      role: 'TENANT_OWNER' as const,
      tenantId: 'tenant_test',
      tenantSlug: 'test-grill',
      tenantName: 'Test Grill',
      permissions: ['tenant:full_access'],
    };

    const { token, sessionId } = authService.signToken(user);

    // Verify valid before revocation
    const validFirst = await authService.verifyToken(token);
    expect(validFirst).not.toBeNull();

    // Revoke session
    await authService.logout(sessionId);

    // Verify rejected after revocation
    const rejectedAfter = await authService.verifyToken(token);
    expect(rejectedAfter).toBeNull();
  });
});
