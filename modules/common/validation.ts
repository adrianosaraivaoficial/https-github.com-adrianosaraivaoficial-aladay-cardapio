import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({
          success: false,
          error: 'Dados de requisição inválidos (Validação de DTO falhou).',
          details: err.issues.map((i) => ({
            field: i.path.join('.'),
            message: i.message,
            code: i.code,
          })),
        });
        return;
      }
      res.status(400).json({ success: false, error: 'Falha na validação do corpo da requisição.' });
    }
  };
}

export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.query = schema.parse(req.query) as any;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({
          success: false,
          error: 'Parâmetros de consulta inválidos.',
          details: err.issues.map((i) => ({
            field: i.path.join('.'),
            message: i.message,
          })),
        });
        return;
      }
      res.status(400).json({ success: false, error: 'Falha na validação dos parâmetros de URL.' });
    }
  };
}

export function validateParams<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.params = schema.parse(req.params) as any;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({
          success: false,
          error: 'Parâmetros de rota inválidos.',
          details: err.issues.map((i) => ({
            field: i.path.join('.'),
            message: i.message,
          })),
        });
        return;
      }
      res.status(400).json({ success: false, error: 'Falha na validação da rota.' });
    }
  };
}
