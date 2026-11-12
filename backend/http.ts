import type { Express, RequestHandler } from 'express';

// Express 4 does not forward rejected async handlers to the error middleware.
export function installAsyncErrors(app: Express) {
  for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
    const original = app[method].bind(app) as (...args: unknown[]) => unknown;
    Object.defineProperty(app, method, {
      value: (...args: unknown[]) =>
        original(
          ...args.map((arg) => {
            if (typeof arg !== 'function') return arg;
            const handler = arg as RequestHandler;
            const wrapped: RequestHandler = (req, res, next) => {
              try {
                Promise.resolve(handler(req, res, next)).catch(next);
              } catch (error) {
                next(error);
              }
            };
            return wrapped;
          }),
        ),
    });
  }
}
