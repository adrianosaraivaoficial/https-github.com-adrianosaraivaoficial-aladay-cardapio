import { Router, Request, Response } from 'express';
import { validateBody, validateParams } from '../common/validation.ts';
import { CatalogPartitionDtoSchema } from './validation.ts';
import type { CatalogService } from './service.ts';
import { z } from 'zod';

const SlugParamSchema = z.object({
  slug: z.string().min(2),
});

export function createCatalogRouter(catalogService: CatalogService): Router {
  const router = Router();

  router.get('/:slug', validateParams(SlugParamSchema), async (req: Request, res: Response) => {
    const result = await catalogService.getCatalog(req.params.slug);
    res.json({ success: true, data: result.data });
  });

  router.post('/partition', validateBody(CatalogPartitionDtoSchema), async (req: Request, res: Response) => {
    const result = await catalogService.savePartition(req.body);
    res.json(result.data);
  });

  return router;
}
