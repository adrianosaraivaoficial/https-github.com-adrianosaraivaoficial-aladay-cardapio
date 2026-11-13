import { Router, Request, Response } from 'express';
import { validateBody } from '../common/validation.ts';
import { LoginDtoSchema } from './validation.ts';
import type { AuthService } from './service.ts';

export function createAuthRouter(authService: AuthService): Router {
  const router = Router();

  router.post('/login', validateBody(LoginDtoSchema), async (req: Request, res: Response) => {
    const result = await authService.login(req.body);
    if (!result.success || !result.data) {
      res.status(result.statusCode || 400).json({ success: false, error: result.error });
      return;
    }

    res.cookie('aladay_session_token', result.data.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    res.json({
      success: true,
      token: result.data.token,
      sessionId: result.data.sessionId,
      user: result.data.user,
    });
  });

  router.get('/session', async (req: Request, res: Response) => {
    const authHeader = req.headers['authorization'];
    const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const cookieToken = req.cookies?.aladay_session_token;
    const effectiveToken = bearerToken || cookieToken;

    if (!effectiveToken) {
      res.status(401).json({ success: false, error: 'Não autenticado.' });
      return;
    }

    const decoded = await authService.verifyToken(effectiveToken);
    if (!decoded) {
      res.clearCookie('aladay_session_token', { path: '/' });
      res.status(401).json({ success: false, error: 'Sessão inválida ou revogada.' });
      return;
    }

    const result = await authService.refreshSession(decoded);
    if (!result.success || !result.data) {
      res.clearCookie('aladay_session_token', { path: '/' });
      res.status(result.statusCode || 401).json({ success: false, error: result.error });
      return;
    }

    res.cookie('aladay_session_token', result.data.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    res.json({
      success: true,
      token: result.data.token,
      sessionId: result.data.sessionId,
      user: result.data.user,
    });
  });

  router.post('/logout', async (req: Request, res: Response) => {
    const authHeader = req.headers['authorization'];
    const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const cookieToken = req.cookies?.aladay_session_token;
    const effectiveToken = bearerToken || cookieToken;

    if (effectiveToken) {
      const decoded = await authService.verifyToken(effectiveToken);
      if (decoded?.jti) {
        await authService.logout(decoded.jti);
      }
    }

    res.clearCookie('aladay_session_token', { path: '/' });
    res.json({ success: true, message: 'Sessão encerrada com sucesso.' });
  });

  return router;
}
