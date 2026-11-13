import { Router, Request, Response } from 'express';
import { validateBody, validateQuery } from '../common/validation.ts';
import { EvolutionWebhookDtoSchema, WebhookLogsQueryDtoSchema } from './validation.ts';
import type { WebhookService } from './service.ts';
import type { AuthService } from '../auth/service.ts';

export function createWebhooksRouter(webhookService: WebhookService, authService?: AuthService): Router {
  const router = Router();

  // POST /api/v1/webhooks/evolution
  router.post('/evolution', validateBody(EvolutionWebhookDtoSchema), (req: Request, res: Response) => {
    const result = webhookService.processEvolutionWebhook(req.body);
    res.json({ success: true, processed: true, logId: result.data?.id });
  });

  // GET /api/v1/webhooks/logs (Requires authentication and respects tenant scoping)
  router.get('/logs', validateQuery(WebhookLogsQueryDtoSchema), async (req: Request, res: Response) => {
    let userTenantSlug: string | undefined;

    if (authService) {
      const authHeader = req.headers['authorization'];
      const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
      const cookieToken = req.cookies?.aladay_session_token;
      const effectiveToken = bearerToken || cookieToken;

      if (!effectiveToken) {
        res.status(401).json({ success: false, error: 'Acesso aos logs requer autenticação.' });
        return;
      }

      const decoded = await authService.verifyToken(effectiveToken);
      if (!decoded) {
        res.status(401).json({ success: false, error: 'Sessão inválida ou revogada.' });
        return;
      }

      if (decoded.role !== 'SUPER_ADMIN') {
        userTenantSlug = decoded.tenant_slug;
      }
    }

    const query = req.query as any;
    const result = webhookService.getLogs(query, userTenantSlug);
    res.json(result.data);
  });

  return router;
}
