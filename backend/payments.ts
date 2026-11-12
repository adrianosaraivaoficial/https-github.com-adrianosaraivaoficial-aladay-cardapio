import crypto from 'node:crypto';
import { paidAccessUntil } from './billingAccess';
import type { Express } from 'express';
import type { Pool, PoolClient } from 'pg';
import { HttpError, transaction, transactionalRoute } from './database';
import { fingerprint, secretEquals } from './security';

export async function enqueue(
  client: PoolClient,
  tenantId: string,
  aggregateId: string,
  eventType: string,
  payload: unknown,
) {
  await client.query(
    `INSERT INTO outbox_events (id,tenant_id,aggregate_type,aggregate_id,event_type,payload)
    VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
    [
      `evt_${crypto.randomUUID()}`,
      tenantId,
      eventType.split('.')[0],
      aggregateId,
      eventType,
      JSON.stringify(payload),
    ],
  );
}

type PixGenerator = (input: {
  pixKey: string;
  pixKeyType?: string;
  tenantPhone?: string;
  merchantName: string;
  merchantCity: string;
  amountCents: number;
  txid: string;
}) => string;

export function mountPix(app: Express, pool: Pool, generatePix: PixGenerator) {
  app.post(
    '/api/v1/pix/charges',
    transactionalRoute(pool, async (req, res, client) => {
      const orderId = String(req.body?.orderId || '');
      if (!/^ord_[0-9a-f-]{36}$/i.test(orderId))
        return res.status(400).json({ error: 'Pedido inválido.' });
      const orders = await client.query(
        'SELECT * FROM orders WHERE id=$1 FOR UPDATE',
        [orderId],
      );
      const order = orders.rows[0];
      if (!order)
        return res.status(404).json({ error: 'Pedido não encontrado.' });
      if (order.payment_method !== 'Pix' || order.status === 'cancelled')
        return res
          .status(409)
          .json({ error: 'Pedido não permite cobrança Pix.' });
      const charges = await client.query(
        'SELECT * FROM pix_transactions WHERE order_id=$1',
        [orderId],
      );
      let charge = charges.rows[0];
      if (!charge) {
        if (order.payment_status !== 'pending')
          return res.status(409).json({ error: 'Pedido já pago.' });
        const tenants = await client.query(
          'SELECT * FROM tenants WHERE slug=$1',
          [order.tenant_slug],
        );
        const tenant = tenants.rows[0];
        const config = tenant?.pix_config;
        if (!config?.pixKey)
          return res
            .status(409)
            .json({ error: 'O restaurante ainda não configurou o Pix.' });
        const txid = `PIX${crypto.randomBytes(11).toString('hex').toUpperCase()}`;
        const payload = generatePix({
          pixKey: config.pixKey,
          pixKeyType: config.pixKeyType,
          tenantPhone: tenant.phone,
          merchantName:
            config.beneficiaryName || config.merchantName || tenant.name,
          merchantCity: config.merchantCity || 'SAO PAULO',
          amountCents: order.total_cents,
          txid,
        });
        const inserted = await client.query(
          `INSERT INTO pix_transactions
        (txid,order_id,tenant_slug,amount_cents,pix_copia_e_cola,status,psp,expires_at)
        VALUES ($1,$2,$3,$4,$5,'PENDING','direct_bank',NOW()+INTERVAL '15 minutes') RETURNING *`,
          [txid, order.id, order.tenant_slug, order.total_cents, payload],
        );
        charge = inserted.rows[0];
        await client.query(
          'UPDATE orders SET pix_transaction=$1::jsonb,updated_at=NOW() WHERE id=$2 AND tenant_slug=$3',
          [
            JSON.stringify({
              txid,
              status: 'PENDING',
              amountCents: order.total_cents,
            }),
            order.id,
            order.tenant_slug,
          ],
        );
      }
      // Static bank Pix expiration is informational; only authenticated settlement can mark it paid.
      res.json({
        success: true,
        data: {
          txid: charge.txid,
          orderId: charge.order_id,
          tenantSlug: charge.tenant_slug,
          amountCents: charge.amount_cents,
          pixCopiaECola: charge.pix_copia_e_cola,
          status: charge.status,
          expiresAt: charge.expires_at,
          paidAt: charge.paid_at,
          psp: charge.psp,
        },
      });
    }),
  );
  app.get('/api/v1/pix/:txid/status', async (req, res) => {
    const result = await pool.query(
      `SELECT p.txid,p.status,p.paid_at,o.id,o.status AS order_status,o.payment_status
      FROM pix_transactions p JOIN orders o ON o.id=p.order_id AND o.tenant_slug=p.tenant_slug WHERE p.txid=$1`,
      [req.params.txid],
    );
    const row = result.rows[0];
    if (!row)
      return res.status(404).json({ error: 'Cobrança não encontrada.' });
    res.json({
      txid: row.txid,
      status: row.status,
      paid: row.status === 'PAID',
      paidAt: row.paid_at,
      order: {
        id: row.id,
        status: row.order_status,
        paymentStatus: row.payment_status,
      },
    });
  });
  app.post(
    '/api/v1/webhooks/pix',
    transactionalRoute(pool, async (req, res, client) => {
      const secret = process.env.PIX_WEBHOOK_SECRET || '';
      if (!secret)
        return res.status(503).json({ error: 'Webhook não configurado.' });
      if (
        !secretEquals(String(req.headers['x-pix-webhook-token'] || ''), secret)
      )
        return res.status(401).json({ error: 'Webhook não autorizado.' });
      const { txid, endToEndId, amountCents, paidAt } = req.body || {};
      const paidDate = paidAt ? new Date(paidAt) : new Date();
      if (
        !/^[a-zA-Z0-9]{8,80}$/.test(String(txid || '')) ||
        !/^[a-zA-Z0-9_-]{8,100}$/.test(String(endToEndId || '')) ||
        !Number.isSafeInteger(amountCents) ||
        amountCents <= 0 ||
        Number.isNaN(paidDate.getTime())
      ) {
        return res.status(400).json({ error: 'Evento Pix inválido.' });
      }
      // Same lock order as charge creation: order first, then charge.
      const found = await client.query(
        'SELECT order_id FROM pix_transactions WHERE txid=$1',
        [txid],
      );
      if (!found.rows[0])
        return res.status(404).json({ error: 'Cobrança não encontrada.' });
      const orders = await client.query(
        'SELECT * FROM orders WHERE id=$1 FOR UPDATE',
        [found.rows[0].order_id],
      );
      const charges = await client.query(
        'SELECT * FROM pix_transactions WHERE txid=$1 FOR UPDATE',
        [txid],
      );
      const order = orders.rows[0];
      const charge = charges.rows[0];
      if (
        !order ||
        charge.tenant_slug !== order.tenant_slug ||
        amountCents !== charge.amount_cents ||
        amountCents !== order.total_cents
      ) {
        return res
          .status(422)
          .json({ error: 'Pagamento não corresponde à cobrança.' });
      }
      if (charge.status === 'PAID') {
        if (charge.end_to_end_id !== endToEndId)
          return res
            .status(409)
            .json({ error: 'Cobrança já liquidada por outro pagamento.' });
        return res.json({ success: true, duplicate: true });
      }
      const existing = await client.query(
        'SELECT txid FROM pix_transactions WHERE end_to_end_id=$1',
        [endToEndId],
      );
      if (existing.rows.length)
        return res
          .status(409)
          .json({ error: 'Identificador de pagamento já utilizado.' });
      await client.query(
        `INSERT INTO webhook_events (provider,event_id,event_type,payload_hash)
      VALUES ('pix',$1,'PIX_RECEIVED',$2)`,
        [endToEndId, fingerprint(req.body)],
      );
      await client.query(
        `UPDATE pix_transactions SET status='PAID',paid_at=$1,end_to_end_id=$2 WHERE txid=$3`,
        [paidDate.toISOString(), endToEndId, txid],
      );
      // A late settlement must not reset a prepared, delivered or cancelled order.
      await client.query(
        `UPDATE orders SET payment_status='paid_online',
      status=CASE WHEN status='received' THEN 'confirmed' ELSE status END,
      pix_transaction=COALESCE(pix_transaction,'{}'::jsonb) || '{"status":"PAID"}'::jsonb,updated_at=NOW()
      WHERE id=$1 AND tenant_slug=$2`,
        [order.id, order.tenant_slug],
      );
      await enqueue(client, order.tenant_id, order.id, 'order.paid', {
        orderId: order.id,
        tenantSlug: order.tenant_slug,
        amountCents,
      });
      res.json({
        success: true,
        data: { txid, orderId: order.id, paymentStatus: 'paid_online' },
      });
    }),
  );
}

export async function asaasGet(
  resource: string,
): Promise<Record<string, unknown>> {
  if (!process.env.ASAAS_API_KEY)
    throw new HttpError(503, 'Gateway não configurado.');
  const base =
    process.env.ASAAS_ENVIRONMENT === 'production'
      ? 'https://api.asaas.com/v3'
      : 'https://api-sandbox.asaas.com/v3';
  const response = await fetch(`${base}${resource}`, {
    signal: AbortSignal.timeout(10000),
    headers: { access_token: process.env.ASAAS_API_KEY },
  });
  if (!response.ok)
    throw new HttpError(502, 'Não foi possível reconciliar o evento.');
  return response.json();
}

export function mountAsaasWebhook(app: Express, pool: Pool) {
  app.post(
    [
      '/api/v1/asaas/webhook',
      '/api/v1/webhooks/asaas',
      '/api/v1/webhooks/asaas-subscriptions',
    ],
    async (req, res) => {
      if (!process.env.ASAAS_WEBHOOK_TOKEN)
        return res.status(503).json({ error: 'Webhook não configurado.' });
      if (
        !secretEquals(
          String(req.headers['asaas-access-token'] || ''),
          process.env.ASAAS_WEBHOOK_TOKEN,
        )
      )
        return res.status(401).json({ error: 'Webhook não autorizado.' });
      const eventId = String(req.body?.id || '');
      const event = String(req.body?.event || '');
      if (!/^[a-zA-Z0-9_-]{8,180}$/.test(eventId))
        return res
          .status(400)
          .json({ error: 'Identificador de evento inválido.' });
      if (
        ![
          'PAYMENT_RECEIVED',
          'PAYMENT_CONFIRMED',
          'PAYMENT_OVERDUE',
          'PAYMENT_REFUNDED',
          'PAYMENT_DELETED',
          'SUBSCRIPTION_DELETED',
        ].includes(event)
      ) {
        return res.json({ received: true, processed: false });
      }
      const duplicate = await pool.query(
        "SELECT 1 FROM webhook_events WHERE provider='asaas' AND event_id=$1",
        [eventId],
      );
      if (duplicate.rows.length)
        return res.json({ received: true, duplicate: true });
      const paymentId = String(req.body?.payment?.id || '');
      const subscriptionId = String(
        req.body?.subscription?.id || req.body?.payment?.subscription || '',
      );
      if (
        !(event === 'SUBSCRIPTION_DELETED'
          ? /^sub_[a-zA-Z0-9_-]+$/.test(subscriptionId)
          : /^pay_[a-zA-Z0-9_-]+$/.test(paymentId))
      ) {
        return res.status(400).json({ error: 'Recurso de cobrança inválido.' });
      }
      const before = await pool.query(
        `SELECT tenant_slug,updated_at::text AS revision FROM asaas_subscriptions WHERE subscription_id=$1
      OR payload->'invoices' @> $2::jsonb`,
        [subscriptionId, JSON.stringify([{ id: paymentId }])],
      );
      // Reconcile before opening a transaction. Provider state supersedes out-of-order events.
      const remote = await asaasGet(
        event === 'SUBSCRIPTION_DELETED'
          ? `/subscriptions/${encodeURIComponent(subscriptionId)}`
          : `/payments/${encodeURIComponent(paymentId)}`,
      );
      const result = await transaction(pool, async (client) => {
        const rows = await client.query(
          `SELECT *,updated_at::text AS revision FROM asaas_subscriptions WHERE subscription_id=$1
        OR payload->'invoices' @> $2::jsonb FOR UPDATE`,
          [
            String(remote.subscription || subscriptionId),
            JSON.stringify([{ id: paymentId }]),
          ],
        );
        const row = rows.rows[0];
        if (!row) throw new HttpError(422, 'Assinatura desconhecida.');
        const snapshot = before.rows.find(
          (item) => item.tenant_slug === row.tenant_slug,
        );
        if (snapshot && snapshot.revision !== row.revision)
          throw new HttpError(503, 'Evento concorrente; tente novamente.');
        const sub = row.payload;
        let invoice = (sub.invoices || []).find(
          (item: { id: string }) => item.id === paymentId,
        );
        if (
          !invoice &&
          event !== 'SUBSCRIPTION_DELETED' &&
          remote.subscription === row.subscription_id &&
          remote.id === paymentId &&
          Math.round(Number(remote.value) * 100) ===
            Math.round(Number(row.value) * 100) &&
          sub.customer?.id &&
          remote.customer === sub.customer.id
        ) {
          invoice = {
            id: paymentId,
            subscriptionId: row.subscription_id,
            value: Number(remote.value),
            dueDate: String(remote.dueDate || ''),
            billingType: remote.billingType,
            status: 'PENDING',
            invoiceUrl: remote.invoiceUrl,
          };
          sub.invoices = [...(sub.invoices || []), invoice];
        }
        if (
          event !== 'SUBSCRIPTION_DELETED' &&
          (!invoice ||
            remote.id !== paymentId ||
            Math.round(Number(remote.value) * 100) !==
              Math.round(Number(invoice.value) * 100) ||
            (remote.subscription &&
              remote.subscription !== row.subscription_id) ||
            (sub.customer?.id && remote.customer !== sub.customer.id))
        )
          throw new HttpError(422, 'Fatura não corresponde ao pagamento.');
        const claimed = await client.query(
          `INSERT INTO webhook_events (provider,event_id,event_type,payload_hash)
        VALUES ('asaas',$1,$2,$3) ON CONFLICT DO NOTHING RETURNING event_id`,
          [eventId, event, fingerprint(req.body)],
        );
        if (!claimed.rows.length) return { received: true, duplicate: true };
        if (event === 'SUBSCRIPTION_DELETED') {
          if (remote.deleted === true || remote.status === 'INACTIVE')
            sub.status = 'CANCELLED';
        } else {
          const remoteStatus = String(remote.status);
          // Do not let a stale received event undo a refund/deletion.
          invoice.status =
            remoteStatus === 'CONFIRMED'
              ? 'RECEIVED'
              : remote.deleted
                ? 'DELETED'
                : remoteStatus;
          invoice.paymentDate = remote.paymentDate || remote.confirmedDate;
          const latest = [...sub.invoices].sort(
            (a: { dueDate: string }, b: { dueDate: string }) =>
              b.dueDate.localeCompare(a.dueDate),
          )[0];
          if (sub.status !== 'CANCELLED') {
            sub.status =
              latest?.status === 'RECEIVED'
                ? 'ACTIVE'
                : [
                      'OVERDUE',
                      'REFUNDED',
                      'DELETED',
                      'REFUND_REQUESTED',
                    ].includes(latest?.status)
                  ? 'OVERDUE'
                  : sub.status;
          }
        }
        await client.query(
          'UPDATE asaas_subscriptions SET status=$1,payload=$2::jsonb,updated_at=NOW() WHERE tenant_slug=$3',
          [sub.status, JSON.stringify(sub), row.tenant_slug],
        );
        const accessUntil = paidAccessUntil(sub.invoices || []);
        if (
          sub.status === 'ACTIVE' &&
          (!accessUntil || new Date(accessUntil).getTime() <= Date.now())
        ) {
          sub.status = 'OVERDUE';
          await client.query(
            'UPDATE asaas_subscriptions SET status=$1,payload=$2::jsonb WHERE tenant_slug=$3',
            [sub.status, JSON.stringify(sub), row.tenant_slug],
          );
        }
        const tenantStatus =
          sub.status === 'ACTIVE'
            ? 'active'
            : sub.status === 'TRIAL'
              ? 'trial'
              : 'past_due';
        const tenants = await client.query(
          'UPDATE tenants SET subscription_status=$1,subscription_access_until=$3,updated_at=NOW() WHERE slug=$2 RETURNING id',
          [tenantStatus, row.tenant_slug, accessUntil],
        );
        if (tenants.rows[0])
          await enqueue(
            client,
            tenants.rows[0].id,
            row.subscription_id,
            'subscription.updated',
            { tenantSlug: row.tenant_slug, status: sub.status },
          );
        return { received: true, processed: true };
      });
      res.json(result);
    },
  );
}
