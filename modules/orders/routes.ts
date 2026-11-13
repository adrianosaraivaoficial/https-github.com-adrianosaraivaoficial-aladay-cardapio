import { Router, Request, Response } from 'express';
import { validateBody, validateParams } from '../common/validation.ts';
import { CreateOrderDtoSchema, UpdateOrderStatusDtoSchema } from './validation.ts';
import type { OrderService } from './service.ts';
import { z } from 'zod';

const OrderIdParamSchema = z.object({
  id: z.string().min(1),
});

const TenantSlugParamSchema = z.object({
  tenantSlug: z.string().min(2),
});

export function createOrdersRouter(orderService: OrderService): Router {
  const router = Router();

  // POST /api/v1/orders - Place a new order
  router.post('/', validateBody(CreateOrderDtoSchema), async (req: Request, res: Response) => {
    const result = await orderService.createOrder(req.body);
    if (!result.success || !result.data) {
      res.status(result.statusCode || 400).json({ success: false, error: result.error });
      return;
    }
    res.status(201).json({ success: true, data: result.data });
  });

  // GET /api/v1/orders/:id - Get order details
  router.get('/:id', validateParams(OrderIdParamSchema), async (req: Request, res: Response) => {
    const tenantSlug = req.query.tenantSlug as string | undefined;
    const result = await orderService.getOrder(req.params.id, tenantSlug);
    if (!result.success || !result.data) {
      res.status(result.statusCode || 404).json({ success: false, error: result.error });
      return;
    }
    res.json({ success: true, data: result.data });
  });

  // GET /api/v1/orders/tenant/:tenantSlug - List tenant orders for KDS
  router.get('/tenant/:tenantSlug', validateParams(TenantSlugParamSchema), async (req: Request, res: Response) => {
    const result = await orderService.listTenantOrders(req.params.tenantSlug);
    res.json({ success: true, data: result.data });
  });

  // PATCH /api/v1/orders/:id/status - Update order status (KDS)
  router.patch(
    '/:id/status',
    validateParams(OrderIdParamSchema),
    validateBody(UpdateOrderStatusDtoSchema),
    async (req: Request, res: Response) => {
      const tenantSlug = req.query.tenantSlug as string | undefined;
      const result = await orderService.updateOrderStatus(req.params.id, req.body, tenantSlug);
      if (!result.success || !result.data) {
        res.status(result.statusCode || 400).json({ success: false, error: result.error });
        return;
      }
      res.json({ success: true, data: result.data });
    },
  );

  return router;
}
