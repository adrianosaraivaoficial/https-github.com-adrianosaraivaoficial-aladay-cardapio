import { paidAccessUntil } from './billingAccess';
import type { Pool } from 'pg';
import { transaction } from './database';
import { asaasGet } from './payments';

type Remote = Record<string, unknown>;
export async function reconcileBilling(
  pool: Pool,
  slug: string,
): Promise<void> {
  const operations = await pool.query(
    'SELECT status FROM billing_operations WHERE tenant_slug=$1',
    [slug],
  );
  if (!operations.rows[0] || operations.rows[0].status === 'completed') return;
  // Query before retrying any creation. This worker never sends a second charge.
  const subscriptions = await asaasGet(
    `/subscriptions?externalReference=${encodeURIComponent(slug)}&limit=100`,
  );
  const matches = (
    Array.isArray(subscriptions.data) ? subscriptions.data : []
  ) as Remote[];
  if (matches.length !== 1 || subscriptions.hasMore)
    throw new Error('billing_reconciliation_ambiguous');
  const remote = matches[0];
  if (
    !String(remote.id).startsWith('sub_') ||
    remote.externalReference !== slug
  )
    throw new Error('billing_reference_mismatch');
  const listed = await asaasGet(
    `/subscriptions/${encodeURIComponent(String(remote.id))}/payments?limit=100`,
  );
  if (listed.hasMore)
    throw new Error('billing_reconciliation_requires_pagination');
  const payments = (Array.isArray(listed.data) ? listed.data : []) as Remote[];
  const invoices = payments.map((payment) => ({
    id: payment.id,
    subscriptionId: remote.id,
    value: Number(payment.value),
    status: payment.status === 'CONFIRMED' ? 'RECEIVED' : String(payment.status),
    dueDate: String(payment.dueDate),
    paymentDate: payment.paymentDate,
    billingType: payment.billingType,
    invoiceUrl: payment.invoiceUrl,
    description: payment.description,
    referenceMonth: String(payment.dueDate).slice(0, 7),
  }));
  const latest = [...invoices].sort((a, b) =>
    b.dueDate.localeCompare(a.dueDate),
  )[0];
  if (!latest) throw new Error('billing_invoice_pending');
  const status =
    remote.status === 'INACTIVE'
      ? 'CANCELLED'
      : latest.status === 'RECEIVED'
        ? 'ACTIVE'
        : latest.status === 'OVERDUE'
          ? 'OVERDUE'
          : 'PENDING';
  await transaction(pool, async (client) => {
    await client.query('SELECT id FROM tenants WHERE slug=$1 FOR UPDATE', [
      slug,
    ]);
    const operation = await client.query(
      'SELECT status FROM billing_operations WHERE tenant_slug=$1 FOR UPDATE',
      [slug],
    );
    if (operation.rows[0]?.status === 'completed') return;
    const payload = {
      id: remote.id,
      tenantSlug: slug,
      status,
      customer: { id: remote.customer },
      invoices,
      cycle: 'MONTHLY',
      billingType: remote.billingType,
      value: Number(remote.value),
      planName: 'Aladay Pro',
      nextDueDate: remote.nextDueDate,
      createdAt: new Date().toISOString(),
    };
    await client.query(
      `INSERT INTO asaas_subscriptions (tenant_slug,subscription_id,status,billing_type,value,payload)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT(tenant_slug) DO UPDATE SET subscription_id=EXCLUDED.subscription_id,
      status=EXCLUDED.status,billing_type=EXCLUDED.billing_type,value=EXCLUDED.value,payload=EXCLUDED.payload,updated_at=NOW()`,
      [
        slug,
        remote.id,
        status,
        remote.billingType,
        Number(remote.value),
        JSON.stringify(payload),
      ],
    );
    await client.query(
      'UPDATE tenants SET subscription_status=$1,subscription_access_until=$3,updated_at=NOW() WHERE slug=$2',
      [
        status === 'ACTIVE' ? 'active' : 'past_due',
        slug,
        paidAccessUntil(invoices),
      ],
    );
    await client.query(
      "UPDATE billing_operations SET status='completed',updated_at=NOW() WHERE tenant_slug=$1",
      [slug],
    );
  });
}
