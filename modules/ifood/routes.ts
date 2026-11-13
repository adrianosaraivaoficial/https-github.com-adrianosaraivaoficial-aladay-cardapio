import { Router, Request, Response } from 'express';
import { validateBody, validateParams } from '../common/validation.ts';
import { IfoodConfigDtoSchema } from './validation.ts';
import type { IfoodService } from './service.ts';
import { z } from 'zod';

const SlugParamSchema = z.object({
  slug: z.string().min(2),
});

export function createIfoodRouter(ifoodService: IfoodService): Router {
  const router = Router();

  router.get('/status/:slug', validateParams(SlugParamSchema), async (req: Request, res: Response) => {
    const result = await ifoodService.getStatus(req.params.slug);
    res.json(result.data);
  });

  router.put('/config/:slug', validateParams(SlugParamSchema), validateBody(IfoodConfigDtoSchema), async (req: Request, res: Response) => {
    const result = await ifoodService.saveConfig(req.params.slug, req.body);
    res.json({ success: true, data: result.data });
  });

  return router;
}
