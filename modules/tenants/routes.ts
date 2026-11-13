import { Router, Request, Response } from 'express';
import { validateBody, validateParams } from '../common/validation.ts';
import { CreateTenantDtoSchema, UpdateTenantDtoSchema, TenantSlugSchema } from './validation.ts';
import type { TenantService } from './service.ts';
import { z } from 'zod';

const SlugParamSchema = z.object({
  slug: TenantSlugSchema,
});

export function createTenantsRouter(tenantService: TenantService): Router {
  const router = Router();

  router.get('/', async (_req: Request, res: Response) => {
    const result = await tenantService.getAllTenants();
    res.json({ success: true, data: result.data });
  });

  router.get('/:slug', validateParams(SlugParamSchema), async (req: Request, res: Response) => {
    const result = await tenantService.getTenantBySlug(req.params.slug);
    if (!result.success || !result.data) {
      res.status(result.statusCode || 404).json({ success: false, error: result.error });
      return;
    }
    res.json({ success: true, data: result.data });
  });

  router.post('/', validateBody(CreateTenantDtoSchema), async (req: Request, res: Response) => {
    const result = await tenantService.createTenant(req.body);
    if (!result.success || !result.data) {
      res.status(result.statusCode || 400).json({ success: false, error: result.error });
      return;
    }
    res.status(201).json({ success: true, data: result.data });
  });

  router.put('/:slug', validateParams(SlugParamSchema), validateBody(UpdateTenantDtoSchema), async (req: Request, res: Response) => {
    const result = await tenantService.updateTenant(req.params.slug, req.body);
    if (!result.success || !result.data) {
      res.status(result.statusCode || 400).json({ success: false, error: result.error });
      return;
    }
    res.json({ success: true, data: result.data });
  });

  return router;
}
