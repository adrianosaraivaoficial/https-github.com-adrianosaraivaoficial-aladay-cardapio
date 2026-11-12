import type { Pool, PoolClient } from 'pg';

export async function transaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL statement_timeout = '15s'");
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// Sends JSON only after COMMIT. Handler errors never become successful responses.
export function transactionalRoute(
  pool: Pool,
  handler: (
    req: import('express').Request,
    res: import('express').Response,
    client: PoolClient,
    afterCommit: (callback: () => void) => void,
  ) => Promise<unknown>,
): import('express').RequestHandler {
  return async (req, res, next) => {
    const originalJson = res.json.bind(res);
    let body: unknown;
    const callbacks: Array<() => void> = [];
    res.json = ((value: unknown) => {
      body = value;
      return res;
    }) as typeof res.json;
    try {
      await transaction(pool, async (client) => {
        await handler(req, res, client, (callback) => callbacks.push(callback));
        if (res.statusCode >= 400)
          throw new HttpError(res.statusCode, 'Requisição rejeitada.');
      });
      res.json = originalJson;
      callbacks.forEach((callback) => callback());
      originalJson(body);
    } catch (error) {
      res.json = originalJson;
      if (error instanceof HttpError) {
        res.status(error.status).json(body || { error: error.message });
      } else {
        next(error);
      }
    }
  };
}
