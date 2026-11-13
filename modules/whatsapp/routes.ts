import { Router, Request, Response } from 'express';
import { validateBody, validateParams } from '../common/validation.ts';
import { SendMessageDtoSchema, EvolutionConfigDtoSchema } from './validation.ts';
import type { WhatsAppService } from './service.ts';
import { z } from 'zod';

const SlugParamSchema = z.object({
  slug: z.string().min(2),
});

export function createWhatsAppRouter(whatsAppService: WhatsAppService): Router {
  const router = Router();

  router.post('/send', validateBody(SendMessageDtoSchema), async (req: Request, res: Response) => {
    const result = await whatsAppService.sendMessage(req.body);
    res.json(result.data);
  });

  router.put('/config/:slug', validateParams(SlugParamSchema), validateBody(EvolutionConfigDtoSchema), async (req: Request, res: Response) => {
    const result = await whatsAppService.saveEvolutionConfig(req.params.slug, req.body);
    res.json({ success: true, data: result.data });
  });

  return router;
}
