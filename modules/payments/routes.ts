import { Router, Request, Response } from 'express';
import { validateBody, validateParams } from '../common/validation.ts';
import { GeneratePixDtoSchema, SimulatePixPaymentDtoSchema } from './validation.ts';
import type { PaymentService } from './service.ts';
import { z } from 'zod';

const TxidParamSchema = z.object({
  txid: z.string().min(5),
});

export function createPaymentsRouter(paymentService: PaymentService): Router {
  const router = Router();

  router.post('/pix/generate', validateBody(GeneratePixDtoSchema), async (req: Request, res: Response) => {
    const result = await paymentService.generatePix(req.body);
    if (!result.success || !result.data) {
      res.status(result.statusCode || 400).json({ success: false, error: result.error });
      return;
    }
    res.json({ success: true, ...result.data });
  });

  router.post('/pix/simulate', validateBody(SimulatePixPaymentDtoSchema), async (req: Request, res: Response) => {
    const result = await paymentService.simulatePayment(req.body);
    if (!result.success || !result.data) {
      res.status(result.statusCode || 400).json({ success: false, error: result.error });
      return;
    }
    res.json({ success: true, message: 'Pix confirmado!', charge: result.data });
  });

  router.get('/pix/status/:txid', validateParams(TxidParamSchema), async (req: Request, res: Response) => {
    const result = await paymentService.getStatus(req.params.txid);
    if (!result.success || !result.data) {
      res.status(result.statusCode || 404).json({ success: false, error: result.error });
      return;
    }
    res.json({ success: true, data: result.data });
  });

  return router;
}
