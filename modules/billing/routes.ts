import { Router, Request, Response } from 'express';
import { validateBody, validateParams } from '../common/validation.ts';
import { AsaasWebhookEventSchema } from './validation.ts';
import type { BillingService } from './service.ts';
import { z } from 'zod';

const SlugParamSchema = z.object({
  slug: z.string().min(2),
});

export function createBillingRouter(billingService: BillingService): Router {
  const router = Router();

  router.get('/subscription/:slug', validateParams(SlugParamSchema), async (req: Request, res: Response) => {
    const result = await billingService.getSubscription(req.params.slug);
    res.json({ success: true, data: result.data });
  });

  router.post('/webhook', validateBody(AsaasWebhookEventSchema), async (req: Request, res: Response) => {
    const result = await billingService.processWebhook(req.body);
    res.json(result.data);
  });

  return router;
}
