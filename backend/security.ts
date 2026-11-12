import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

export function secretEquals(provided: string, configured: string): boolean {
  const a = Buffer.from(provided || '');
  const b = Buffer.from(configured || '');
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function phoneNumber(value: unknown): string {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
}

export function fingerprint(value: unknown): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(value))
    .digest('hex');
}

// Public surface is explicit. New routes are private until classified here.
export function isPublicRoute(method: string, pathname: string): boolean {
  if (method === 'GET')
    return [
      /^\/api\/v1\/(health|ready)$/,
      /^\/api\/v1\/tenants\/[a-z0-9-]+(?:\/(?:catalog|products|categories))?$/,
      /^\/api\/v1\/orders\/ord_[0-9a-f-]{36}\/tracking$/i,
      /^\/api\/v1\/pix\/[a-z0-9]+\/status$/i,
    ].some((pattern) => pattern.test(pathname));
  return (
    method === 'POST' &&
    [
      '/api/v1/auth/login',
      '/api/v1/auth/whatsapp-otp/request',
      '/api/v1/auth/whatsapp-otp/verify',
      '/api/v1/orders/checkout',
      '/api/v1/pix/charges',
      '/api/v1/webhooks/pix',
      '/api/v1/asaas/webhook',
      '/api/v1/webhooks/asaas',
      '/api/v1/webhooks/asaas-subscriptions',
    ].includes(pathname)
  );
}

export function productionSimulationGuard(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (
    process.env.NODE_ENV === 'production' &&
    /(?:simulate|test-dispatch|test-notification|test-send|test-agent|test-and-migrate)/.test(
      req.path,
    )
  ) {
    return res.status(404).json({ error: 'Rota indisponível.' });
  }
  next();
}
