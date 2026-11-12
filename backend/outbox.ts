import crypto from 'node:crypto';
import type { Pool } from 'pg';
import { reconcileBilling } from './billingRecovery';
import { transaction } from './database';

export async function processOutbox(pool: Pool): Promise<boolean> {
  const token = crypto.randomUUID();
  const event = await transaction(pool, async (client) => {
    const result = await client.query(`SELECT * FROM outbox_events WHERE
      (status='pending' AND available_at<=NOW()) OR (status='processing' AND locked_at<NOW()-INTERVAL '2 minutes')
      ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1`);
    const row = result.rows[0];
    if (!row) return null;
    if (row.attempts >= 10) {
      await client.query(
        "UPDATE outbox_events SET status='dead',last_error='attempts_exhausted',locked_at=NULL,lock_token=NULL WHERE id=$1",
        [row.id],
      );
      return null;
    }
    await client.query(
      `UPDATE outbox_events SET status='processing',locked_at=NOW(),lock_token=$1,attempts=attempts+1 WHERE id=$2`,
      [token, row.id],
    );
    return { ...row, attempts: row.attempts + 1 };
  });
  if (!event) return false;
  try {
    if (event.event_type === 'billing.reconcile') {
      await reconcileBilling(pool, String(event.payload.tenantSlug));
    } else {
      const endpoint = process.env.N8N_WEBHOOK_URL;
      if (!endpoint || !process.env.N8N_WORKER_TOKEN)
        throw new Error('delivery_not_configured');
      const response = await fetch(endpoint, {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.N8N_WORKER_TOKEN}`,
          'Idempotency-Key': event.id,
        },
        body: JSON.stringify({
          id: event.id,
          type: event.event_type,
          tenantId: event.tenant_id,
          aggregateId: event.aggregate_id,
          payload: event.payload,
        }),
      });
      if (!response.ok) throw new Error('delivery_rejected');
    }
    await pool.query(
      `UPDATE outbox_events SET status='completed',processed_at=NOW(),last_error=NULL,
      locked_at=NULL,lock_token=NULL WHERE id=$1 AND lock_token=$2`,
      [event.id, token],
    );
  } catch {
    await pool.query(
      `UPDATE outbox_events SET status=$1,last_error='delivery_failed',locked_at=NULL,lock_token=NULL,
      available_at=NOW()+$2 * INTERVAL '1 second' WHERE id=$3 AND lock_token=$4`,
      [
        event.attempts >= 10 ? 'dead' : 'pending',
        Math.min(3600, 2 ** event.attempts),
        event.id,
        token,
      ],
    );
  }
  return true;
}

export function startOutboxWorker(pool: Pool): () => void {
  let stopping = false;
  let running = false;
  const tick = async () => {
    if (stopping || running) return;
    running = true;
    try {
      for (
        let count = 0;
        count < 20 && !stopping && (await processOutbox(pool));
        count++
      );
    } catch {
      console.error(
        JSON.stringify({ level: 'error', event: 'outbox_worker_failed' }),
      );
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => {
    void tick();
  }, 1000);
  timer.unref();
  void tick();
  return () => {
    stopping = true;
    clearInterval(timer);
  };
}
