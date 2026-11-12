import test from 'node:test';
import assert from 'node:assert/strict';
import { isPublicRoute, phoneNumber, secretEquals } from '../backend/security';

test('public perimeter never exposes integration, administration, repeat orders or sequential tracking IDs', () => {
  for (const path of [
    '/api/v1/tenants',
    '/api/v1/n8n/agent-context/foo',
    '/api/v1/evolution/instances',
    '/api/v1/tenants/foo/repeat-order',
    '/api/v1/asaas/subscription/foo/check-status',
    '/api/v1/orders/ord_1042/tracking',
  ]) {
    assert.equal(isPublicRoute('GET', path), false, path);
  }
  assert.equal(isPublicRoute('POST', '/api/v1/bot/simulate-message'), false);
  assert.equal(isPublicRoute('PUT', '/api/v1/tenants/foo/settings'), false);
  assert.equal(isPublicRoute('GET', '/api/v1/tenants/foo/catalog'), true);
  assert.equal(isPublicRoute('POST', '/api/v1/webhooks/asaas'), true);
});
test('secrets fail closed and registered phones normalize consistently', () => {
  assert.equal(secretEquals('', ''), false);
  assert.equal(secretEquals('test', 'different'), false);
  assert.equal(secretEquals('same', 'same'), true);
  assert.equal(phoneNumber('(11) 99999-9999'), '5511999999999');
  assert.equal(phoneNumber('+55 11 99999-9999'), '5511999999999');
});

test('server menu metadata escapes untrusted restaurant names and script boundaries', async () => {
  const { menuHtml } = await import('../backend/seo');
  const template =
    '<title>Old</title><meta name="description" content="old"><link rel="canonical" href="old"><script id="aladay-structured-data" type="application/ld+json">{}</script>';
  const html = menuHtml(
    template,
    { name: '$& <img src=x onerror=alert(1)> </script>', slug: 'test' },
    'https://example.invalid',
  );
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img'));
  assert.ok(html.includes('\\u003c/script>'));
  assert.ok(html.includes('https://example.invalid/cardapio/test'));
});

test('CPF/CNPJ check digits reject placeholders and repeated digits', async () => {
  const { validTaxId } = await import('../backend/validation');
  assert.equal(validTaxId('529.982.247-25'), true);
  assert.equal(validTaxId('11.222.333/0001-81'), true);
  assert.equal(validTaxId('00000000000000'), false);
  assert.equal(validTaxId('11111111111'), false);
  assert.equal(validTaxId('52998224726'), false);
});

test('settled service periods expire and month ends are clamped', async () => {
  const { paidAccessUntil } = await import('../backend/billingAccess');
  assert.equal(
    paidAccessUntil([{ status: 'RECEIVED', dueDate: '2026-01-31' }]),
    '2026-02-28T00:00:00.000Z',
  );
  assert.equal(
    paidAccessUntil([{ status: 'REFUNDED', dueDate: '2026-01-31' }]),
    null,
  );
});
