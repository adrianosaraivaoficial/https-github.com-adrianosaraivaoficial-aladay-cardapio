import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import express from 'express';
import pg from 'pg';
import { processOutbox } from '../backend/outbox';
import { mountAsaasWebhook } from '../backend/payments';
import { installAsyncErrors } from '../backend/http';
import { HttpError } from '../backend/database';

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString || !new URL(connectionString).pathname.endsWith('_test'))
  throw new Error(
    'TEST_DATABASE_URL deve apontar para banco descartável com sufixo _test.',
  );
const pool = new pg.Pool({ connectionString });
const base = 'http://127.0.0.1:32199';
const password = 'test-owner-password';
const currentDue = new Date().toISOString().slice(0, 10);
const renewalDue = new Date(Date.now() + 35 * 86400000)
  .toISOString()
  .slice(0, 10);
const hash = () => {
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt$${salt}$${crypto.scryptSync(password, salt, 64).toString('hex')}`;
};
let child: ChildProcess;
let ownerToken = '';
let kitchenToken = '';
let adminToken = '';
let orderId = '';
let txid = '';
let output = '';
const deliveries: Array<{ number: string; text: string }> = [];
const evolution = createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk);
  deliveries.push(JSON.parse(Buffer.concat(chunks).toString()));
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end('{}');
});
async function request(
  path: string,
  body?: unknown,
  token?: string,
  method?: string,
) {
  const res = await fetch(`${base}${path}`, {
    method: method || (body === undefined ? 'GET' : 'POST'),
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}
const cart = (key = crypto.randomUUID()) => ({
  tenantSlug: 'test-a',
  customerName: 'Teste Cliente',
  customerPhone: '11999999999',
  type: 'pickup',
  paymentMethod: 'Pix',
  idempotencyKey: key,
  items: [{ productId: 'test-product-a', quantity: 2, selectedOptions: [] }],
  totalCents: 1,
  paymentStatus: 'paid_online',
});
before(async () => {
  await pool.query(fs.readFileSync('database/easypanel-init.sql', 'utf8'));
  await pool.query(fs.readFileSync('database/easypanel-init.sql', 'utf8'));
  await pool.query(
    'TRUNCATE auth_sessions,auth_otp,rate_limits,billing_operations,webhook_events,outbox_events,pix_transactions,orders,products,categories,subscriber_users,asaas_subscriptions,tenants CASCADE',
  );
  for (const suffix of ['a', 'b']) {
    await pool.query(
      `INSERT INTO tenants (id,name,slug,phone,pix_config) VALUES ($1,$2,$3,'5511999999999',$4::jsonb)`,
      [
        `test-tenant-${suffix}`,
        `Teste ${suffix}`,
        `test-${suffix}`,
        JSON.stringify({
          pixKey: 'test@example.invalid',
          pixKeyType: 'email',
          merchantName: 'TESTE',
          merchantCity: 'BELEM',
        }),
      ],
    );
    await pool.query(
      'INSERT INTO categories (id,tenant_id,tenant_slug,name) VALUES ($1,$2,$3,$4)',
      [
        `test-cat-${suffix}`,
        `test-tenant-${suffix}`,
        `test-${suffix}`,
        'Categoria',
      ],
    );
    await pool.query(
      'INSERT INTO products (id,tenant_id,tenant_slug,category_id,name,price_cents) VALUES ($1,$2,$3,$4,$5,1250)',
      [
        `test-product-${suffix}`,
        `test-tenant-${suffix}`,
        `test-${suffix}`,
        `test-cat-${suffix}`,
        'Produto',
      ],
    );
  }
  for (const [id, email, role] of [
    ['test-owner', 'owner@example.invalid', 'TENANT_OWNER'],
    ['test-kitchen', 'kitchen@example.invalid', 'KITCHEN_STAFF'],
  ]) {
    await pool.query(
      `INSERT INTO subscriber_users (id,name,email,password_hash,phone,role,tenant_id,tenant_slug) VALUES ($1,'Teste',$2,$3,'5511988887777',$4,'test-tenant-a','test-a')`,
      [id, email, hash(), role],
    );
  }
  evolution.listen(0, '127.0.0.1');
  await once(evolution, 'listening');
  const address = evolution.address();
  assert.ok(address && typeof address !== 'string');
  child = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    env: {
      ...process.env,
      NODE_ENV: 'development',
      PORT: '32199',
      DATABASE_URL: connectionString,
      JWT_SECRET: 'test-only-jwt-secret-with-more-than-32-chars',
      ADMIN_EMAIL: 'admin@example.invalid',
      ADMIN_PASSWORD: 'test-admin-password',
      PIX_WEBHOOK_SECRET: 'test-webhook-pix',
      ASAAS_API_KEY: '',
      OUTBOX_WORKER_ENABLED: 'false',
      EVOLUTION_API_URL: `http://127.0.0.1:${address.port}`,
      EVOLUTION_API_KEY: 'test-only',
      DISABLE_HMR: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (chunk) => {
    output = (output + chunk).slice(-4000);
  });
  child.stderr?.on('data', (chunk) => {
    output = (output + chunk).slice(-4000);
  });
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      if ((await fetch(`${base}/api/v1/ready`)).ok) {
        ready = true;
        break;
      }
    } catch {}
    if (child.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(ready, `API não iniciou: ${output}`);
  ownerToken = (
    await request('/api/v1/auth/login', {
      email: 'owner@example.invalid',
      password,
    })
  ).body.token;
  kitchenToken = (
    await request('/api/v1/auth/login', {
      email: 'kitchen@example.invalid',
      password,
    })
  ).body.token;
  adminToken = (
    await request('/api/v1/auth/login', {
      email: 'admin@example.invalid',
      password: 'test-admin-password',
    })
  ).body.token;
  assert.ok(ownerToken);
  assert.ok(kitchenToken);
  assert.ok(adminToken);
});
after(async () => {
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    await once(child, 'exit');
  }
  evolution.closeAllConnections();
  await new Promise<void>((resolve) => evolution.close(() => resolve()));
  await pool.query(
    'DROP TRIGGER IF EXISTS test_reject_outbox ON outbox_events; DROP FUNCTION IF EXISTS test_reject_outbox()',
  );
  await pool.end();
});
test('private routes, tenant scope, kitchen role and public DTOs', async () => {
  for (const path of [
    '/api/v1/tenants',
    '/api/v1/evolution/instances',
    '/api/v1/n8n/conversation-memory',
    '/api/v1/n8n/agent-context/test-a',
  ])
    assert.equal((await request(path)).status, 401, path);
  assert.equal(
    (await request('/api/v1/tenants/test-b/orders', undefined, ownerToken))
      .status,
    403,
  );
  assert.equal(
    (
      await request(
        '/api/v1/tenants/test-a/settings',
        { name: 'No' },
        kitchenToken,
        'PUT',
      )
    ).status,
    403,
  );
  const catalog = await request('/api/v1/tenants/test-a/catalog');
  assert.equal(catalog.status, 200);
  for (const key of [
    'pixConfig',
    'pixKey',
    'evolutionInstanceId',
    'statusNotificationTemplates',
    'subscriptionStatus',
  ])
    assert.equal(key in catalog.body.data.tenant, false, key);
  assert.equal(
    (await request('/api/v1/tenants/test-a/repeat-order?orderId=ord_1042'))
      .status,
    403,
  );
});
test('concurrent checkout recalculates cents, creates one order and one durable event', async () => {
  const body = cart();
  const results = await Promise.all(
    Array.from({ length: 12 }, () => request('/api/v1/orders/checkout', body)),
  );
  assert.ok(
    results.every((result) => [200, 201].includes(result.status)),
    JSON.stringify(results),
  );
  assert.equal(new Set(results.map((result) => result.body.data.id)).size, 1);
  orderId = results[0].body.data.id;
  assert.equal(results[0].body.data.totalCents, 2500);
  assert.equal(results[0].body.data.paymentStatus, 'pending');
  assert.equal(
    (
      await pool.query(
        'SELECT COUNT(*)::int AS count FROM outbox_events WHERE aggregate_id=$1',
        [orderId],
      )
    ).rows[0].count,
    1,
  );
  assert.equal(
    (
      await request('/api/v1/orders/checkout', {
        ...body,
        items: [{ productId: 'test-product-a', quantity: 1 }],
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request('/api/v1/orders/checkout', {
        ...cart(),
        items: [{ productId: 'test-product-b', quantity: 1 }],
      })
    ).status,
    409,
  );
});
test('failed event insert rolls back order, allowing retry with the same key', async () => {
  const body = cart();
  await pool.query(`CREATE FUNCTION test_reject_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; END $$;
    CREATE TRIGGER test_reject_outbox BEFORE INSERT ON outbox_events FOR EACH ROW EXECUTE FUNCTION test_reject_outbox()`);
  try {
    assert.equal((await request('/api/v1/orders/checkout', body)).status, 503);
    assert.equal(
      (
        await pool.query(
          'SELECT COUNT(*)::int AS count FROM orders WHERE idempotency_key=$1',
          [body.idempotencyKey],
        )
      ).rows[0].count,
      0,
    );
  } finally {
    await pool.query(
      'DROP TRIGGER test_reject_outbox ON outbox_events; DROP FUNCTION test_reject_outbox()',
    );
  }
  assert.equal((await request('/api/v1/orders/checkout', body)).status, 201);
});
test('catalog collision cannot modify another tenant and bulk changes roll back', async () => {
  const res = await request(
    '/api/v1/tenants/test-a/catalog/import',
    {
      products: [
        {
          id: 'test-product-b',
          categoryId: 'test-cat-a',
          name: 'Invadido',
          priceCents: 1,
        },
      ],
    },
    ownerToken,
  );
  assert.equal(res.status, 409);
  assert.equal(
    (await pool.query("SELECT name FROM products WHERE id='test-product-b'"))
      .rows[0].name,
    'Produto',
  );
  assert.equal(
    (
      await request(
        '/api/v1/tenants/test-a/settings',
        { subscriptionStatus: 'active', tenant_id: 'test-tenant-b' },
        ownerToken,
        'PUT',
      )
    ).status,
    200,
  );
});
test('Pix charge is idempotent and settlement validates amount, auth, date and end-to-end ID', async () => {
  const charges = await Promise.all(
    Array.from({ length: 4 }, () =>
      request('/api/v1/pix/charges', { orderId }),
    ),
  );
  assert.ok(
    charges.every((result) => result.status === 200),
    JSON.stringify(charges),
  );
  assert.equal(new Set(charges.map((result) => result.body.data.txid)).size, 1);
  txid = charges[0].body.data.txid;
  assert.ok(txid.length<=25);
  assert.ok(charges[0].body.data.pixCopiaECola.includes(`05${String(txid.length).padStart(2,'0')}${txid}`));
  const body = {
    txid,
    endToEndId: 'E-test-unique-payment-01',
    amountCents: 2500,
  };
  assert.equal((await request('/api/v1/webhooks/pix', body)).status, 401);
  async function webhook(data: unknown) {
    const r = await fetch(`${base}/api/v1/webhooks/pix`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-pix-webhook-token': 'test-webhook-pix',
      },
      body: JSON.stringify(data),
    });
    return { status: r.status, body: await r.json() };
  }
  assert.equal((await webhook({ ...body, amountCents: 1 })).status, 422);
  assert.equal((await webhook({ ...body, paidAt: 'invalid' })).status, 400);
  const results = await Promise.all([webhook(body), webhook(body)]);
  assert.ok(
    results.every((r) => r.status === 200),
    JSON.stringify(results),
  );
  assert.equal(
    (
      await pool.query(
        "SELECT COUNT(*)::int AS count FROM outbox_events WHERE event_type='order.paid' AND aggregate_id=$1",
        [orderId],
      )
    ).rows[0].count,
    1,
  );
  const status = await request(`/api/v1/pix/${txid}/status`);
  assert.equal(status.body.paid, true);
  assert.equal(
    (await request(`/api/v1/orders/${orderId}/tracking`)).body.data.order
      .paymentStatus,
    'paid_online',
  );
});
test('OTP ignores supplied destination, is hashed, single use and bound to the account', async () => {
  const res = await request('/api/v1/auth/whatsapp-otp/request', {
    email: 'owner@example.invalid',
    phone: '5511111111111',
  });
  assert.equal(res.status, 200);
  assert.equal(deliveries.at(-1)?.number, '5511988887777');
  const code = deliveries.at(-1)?.text.match(/\d{6}/)?.[0];
  assert.ok(code);
  const stored = (
    await pool.query(
      "SELECT code_hash FROM auth_otp WHERE email='owner@example.invalid'",
    )
  ).rows[0];
  assert.notEqual(stored.code_hash, code);
  const verified = await request('/api/v1/auth/whatsapp-otp/verify', {
    email: 'owner@example.invalid',
    code,
  });
  assert.equal(verified.status, 200);
  assert.ok(verified.body.token);
  assert.equal(
    (
      await request('/api/v1/auth/whatsapp-otp/verify', {
        email: 'owner@example.invalid',
        code,
      })
    ).status,
    401,
  );
});
test('sessions do not extend expiry and logout revokes a signed token', async () => {
  const session = await request('/api/v1/auth/session', undefined, ownerToken);
  assert.equal(session.body.token, ownerToken);
  assert.equal(
    (await request('/api/v1/auth/logout', {}, ownerToken)).status,
    200,
  );
  assert.equal(
    (await request('/api/v1/auth/session', undefined, ownerToken)).status,
    401,
  );
});
test('worker retries durably and concurrent workers claim separate events', async () => {
  await pool.query("UPDATE outbox_events SET status='completed'");
  for (const suffix of ['1', '2'])
    await pool.query(
      `INSERT INTO outbox_events (id,tenant_id,aggregate_type,aggregate_id,event_type,payload)
    VALUES ($1,'test-tenant-a','order','test','order.test','{}')`,
      [`worker-test-${suffix}`],
    );
  const previous = process.env.N8N_WEBHOOK_URL;
  delete process.env.N8N_WEBHOOK_URL;
  try {
    await Promise.all([processOutbox(pool), processOutbox(pool)]);
    const rows = (
      await pool.query(
        "SELECT attempts,status,last_error FROM outbox_events WHERE id LIKE 'worker-test-%'",
      )
    ).rows;
    assert.equal(rows.length, 2);
    assert.ok(
      rows.every(
        (row) =>
          row.attempts === 1 &&
          row.status === 'pending' &&
          row.last_error === 'delivery_failed',
      ),
    );
  } finally {
    if (previous) process.env.N8N_WEBHOOK_URL = previous;
  }
});
test('Asaas reconciles authoritative state, handles reordered events and rejects mismatched amounts', async () => {
  const app = express();
  installAsyncErrors(app);
  app.use(express.json());
  mountAsaasWebhook(app, pool);
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) =>
      res
        .status(error instanceof HttpError ? error.status : 503)
        .json({ error: 'failed' }),
  );
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const sub = {
    id: 'sub_test_known',
    tenantSlug: 'test-a',
    status: 'PENDING',
    customer: { id: 'cus_test' },
    invoices: [
      {
        id: 'pay_test_known',
        value: 129.9,
        status: 'PENDING',
        dueDate: currentDue,
      },
    ],
  };
  await pool.query(
    `INSERT INTO asaas_subscriptions (tenant_slug,subscription_id,payload) VALUES ('test-a',$1,$2::jsonb) ON CONFLICT(tenant_slug) DO UPDATE SET subscription_id=EXCLUDED.subscription_id,payload=EXCLUDED.payload`,
    [sub.id, JSON.stringify(sub)],
  );
  const originalFetch = globalThis.fetch;
  let remoteStatus = 'RECEIVED';
  let remoteValue = 129.9;
  process.env.ASAAS_API_KEY = 'test';
  process.env.ASAAS_WEBHOOK_TOKEN = 'test-asaas-token';
  globalThis.fetch = (async (input, init) =>
    String(input).startsWith('https://api-sandbox.asaas.com/')
      ? new Response(
          JSON.stringify({
            id: 'pay_test_known',
            subscription: sub.id,
            customer: 'cus_test',
            value: remoteValue,
            status: remoteStatus,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      : originalFetch(input, init)) as typeof fetch;
  const webhook = async (id: string, event: string) => {
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/v1/asaas/webhook`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'asaas-access-token': 'test-asaas-token',
        },
        body: JSON.stringify({
          id,
          event,
          payment: { id: 'pay_test_known', subscription: sub.id },
        }),
      },
    );
    return response;
  };
  try {
    assert.equal((await webhook('evt_test_1', 'PAYMENT_RECEIVED')).status, 200);
    assert.equal((await webhook('evt_test_2', 'PAYMENT_OVERDUE')).status, 200);
    assert.equal(
      (
        await pool.query(
          "SELECT status FROM asaas_subscriptions WHERE tenant_slug='test-a'",
        )
      ).rows[0].status,
      'ACTIVE',
    );
    remoteValue = 1;
    assert.equal((await webhook('evt_test_3', 'PAYMENT_RECEIVED')).status, 422);
    remoteValue = 129.9;
    remoteStatus = 'REFUNDED';
    assert.equal((await webhook('evt_test_4', 'PAYMENT_REFUNDED')).status, 200);
    assert.equal(
      (await webhook('evt_test_5', 'PAYMENT_CONFIRMED')).status,
      200,
    );
    assert.equal(
      (
        await pool.query(
          "SELECT status FROM asaas_subscriptions WHERE tenant_slug='test-a'",
        )
      ).rows[0].status,
      'OVERDUE',
    );
    assert.equal(
      (await webhook('evt_test_5', 'PAYMENT_CONFIRMED')).status,
      200,
    );
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.ASAAS_API_KEY;
    delete process.env.ASAAS_WEBHOOK_TOKEN;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('a new recurring Asaas invoice is imported only after provider identity and value match', async () => {
  const app = express();
  installAsyncErrors(app);
  app.use(express.json());
  mountAsaasWebhook(app, pool);
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) =>
      res
        .status(error instanceof HttpError ? error.status : 503)
        .json({ error: 'failed' }),
  );
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const originalFetch = globalThis.fetch;
  process.env.ASAAS_API_KEY = 'test';
  process.env.ASAAS_WEBHOOK_TOKEN = 'test-asaas-token';
  globalThis.fetch = (async (input, init) =>
    String(input).startsWith('https://api-sandbox.asaas.com/')
      ? new Response(
          JSON.stringify({
            id: 'pay_test_renewal',
            subscription: 'sub_test_known',
            customer: 'cus_test',
            value: 129.9,
            status: 'RECEIVED',
            dueDate: renewalDue,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      : originalFetch(input, init)) as typeof fetch;
  try {
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/v1/asaas/webhook`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'asaas-access-token': 'test-asaas-token',
        },
        body: JSON.stringify({
          id: 'evt_renewal_test',
          event: 'PAYMENT_RECEIVED',
          payment: { id: 'pay_test_renewal', subscription: 'sub_test_known' },
        }),
      },
    );
    assert.equal(response.status, 200);
    const row = (
      await pool.query(
        "SELECT status,payload FROM asaas_subscriptions WHERE tenant_slug='test-a'",
      )
    ).rows[0];
    assert.equal(row.status, 'ACTIVE');
    assert.equal(
      row.payload.invoices.find(
        (invoice: { id: string }) => invoice.id === 'pay_test_renewal',
      ).status,
      'RECEIVED',
    );
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.ASAAS_API_KEY;
    delete process.env.ASAAS_WEBHOOK_TOKEN;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
test('administrative provisioning persists before response and tenant deletion removes dependent data', async () => {
  const created = await request(
    '/api/v1/tenants',
    { name: 'Teste descarte', slug: 'test-disposable', phone: '11987654321' },
    adminToken,
  );
  assert.equal(created.status, 201);
  assert.equal(
    (
      await pool.query(
        "SELECT COUNT(*)::int AS count FROM tenants WHERE slug='test-disposable'",
      )
    ).rows[0].count,
    1,
  );
  assert.equal(
    (
      await request(
        '/api/v1/tenants/test-disposable',
        undefined,
        adminToken,
        'DELETE',
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT COUNT(*)::int AS count FROM tenants WHERE slug='test-disposable'",
      )
    ).rows[0].count,
    0,
  );
});

test('worker recovers expired leases and delivers the stable idempotency key', async () => {
  await pool.query("UPDATE outbox_events SET status='completed'");
  await pool.query(
    `INSERT INTO outbox_events (id,tenant_id,aggregate_type,aggregate_id,event_type,payload,status,attempts,locked_at,lock_token)
    VALUES ('worker-lease-test','test-tenant-a','order','test','order.test','{}','processing',1,NOW()-INTERVAL '3 minutes',$1)`,
    [crypto.randomUUID()],
  );
  let receivedId = '';
  const receiver = createServer(async (req, res) => {
    receivedId = String(req.headers['idempotency-key']);
    for await (const _chunk of req) {
    }
    res.writeHead(200);
    res.end('{}');
  });
  receiver.listen(0, '127.0.0.1');
  await once(receiver, 'listening');
  const address = receiver.address();
  assert.ok(address && typeof address !== 'string');
  process.env.N8N_WEBHOOK_URL = `http://127.0.0.1:${address.port}`;
  process.env.N8N_WORKER_TOKEN = 'test-only';
  try {
    assert.equal(await processOutbox(pool), true);
    assert.equal(receivedId, 'worker-lease-test');
    const row = (
      await pool.query(
        "SELECT status,attempts,lock_token FROM outbox_events WHERE id='worker-lease-test'",
      )
    ).rows[0];
    assert.equal(row.status, 'completed');
    assert.equal(row.attempts, 2);
    assert.equal(row.lock_token, null);
  } finally {
    delete process.env.N8N_WEBHOOK_URL;
    delete process.env.N8N_WORKER_TOKEN;
    receiver.closeAllConnections();
    await new Promise<void>((resolve) => receiver.close(() => resolve()));
  }
});

test('expired paid access blocks checkout even when overdue webhook was not delivered', async () => {
  await pool.query(
    "UPDATE tenants SET subscription_access_until=NOW()-INTERVAL '1 day' WHERE slug='test-b'",
  );
  try {
    const result = await request('/api/v1/orders/checkout', {
      ...cart(),
      tenantSlug: 'test-b',
      items: [{ productId: 'test-product-b', quantity: 1 }],
    });
    assert.equal(result.status, 409);
  } finally {
    await pool.query(
      "UPDATE tenants SET subscription_access_until=NULL WHERE slug='test-b'",
    );
  }
});
