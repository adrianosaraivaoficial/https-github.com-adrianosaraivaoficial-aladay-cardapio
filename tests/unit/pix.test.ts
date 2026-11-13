import { describe, it, expect } from 'vitest';
import { PaymentService } from '../../modules/payments/service.ts';
import { PaymentRepository } from '../../modules/payments/repository.ts';

describe('Unit Tests: Pix BR Code & CRC-16 Checksum', () => {
  const repository = new PaymentRepository(null);
  const paymentService = new PaymentService(repository);

  it('generates standard CRC16 checksum with exactly 4 uppercase hex characters', () => {
    const payload = '00020126360014br.gov.bcb.pix0114+551199999999520400005303986540510.005802BR5913Aladay Burger6009SAO PAULO62070503***6304';
    const crc = paymentService.calculateCrc16(payload);

    expect(crc).toMatch(/^[0-9A-F]{4}$/);
  });

  it('formats Pix EMV string conforming to Banco Central guidelines', () => {
    const pixKey = 'financeiro@aladay.com.br';
    const merchant = 'Brasas Burger';
    const city = 'São Paulo';
    const amountCents = 4590;
    const txid = 'ALADAY123';

    const emv = paymentService.generatePixEmvString(pixKey, merchant, city, amountCents, txid);

    expect(emv).toContain('000201'); // Format indicator
    expect(emv).toContain('br.gov.bcb.pix'); // GUI
    expect(emv).toContain('financeiro@aladay.com.br'); // Pix Key
    expect(emv).toContain('5303986'); // Currency BRL
    expect(emv).toContain('540545.90'); // Amount 45.90
    expect(emv).toContain('5802BR'); // Country Code
    expect(emv).toContain('6009Sao Paulo'); // Sanitized city (accent stripped)
    expect(emv).toContain('ALADAY123'); // TxID
    expect(emv.endsWith(paymentService.calculateCrc16(emv.slice(0, -4)))).toBe(true);
  });

  it('creates and records pending Pix charge', async () => {
    const result = await paymentService.generatePix({
      orderId: 'order_test_99',
      tenantSlug: 'brasas-burger',
      amountCents: 2500,
      customerName: 'Cliente Pix',
    });

    expect(result.success).toBe(true);
    expect(result.data?.txid).toBeDefined();
    expect(result.data?.emvPayload).toBeDefined();

    const statusRes = await paymentService.getStatus(result.data!.txid);
    expect(statusRes.success).toBe(true);
    expect(statusRes.data?.status).toBe('PENDING');
    expect(statusRes.data?.amountCents).toBe(2500);
  });
});
