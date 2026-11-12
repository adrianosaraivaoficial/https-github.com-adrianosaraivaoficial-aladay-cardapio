import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

export const metrics = { requests: 0, errors: 0 };
export function observe(req: Request, res: Response, next: NextFunction) {
  const requestId = crypto.randomUUID();
  const started = performance.now();
  res.setHeader('X-Request-Id', requestId);
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  res.on('finish', () => {
    metrics.requests++;
    if (res.statusCode >= 500) metrics.errors++;
    // Route templates avoid logging IDs, query strings, phone numbers and credentials.
    console.log(
      JSON.stringify({
        level: 'info',
        event: 'http',
        requestId,
        method: req.method,
        route: req.route?.path || 'unmatched',
        status: res.statusCode,
        durationMs: Math.round(performance.now() - started),
      }),
    );
  });
  next();
}
