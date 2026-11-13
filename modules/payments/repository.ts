import type { Pool } from 'pg';

export interface PixChargeEntity {
  id: string;
  txid: string;
  orderId: string;
  tenantSlug: string;
  amountCents: number;
  status: 'PENDING' | 'PAID' | 'EXPIRED';
  emvPayload: string;
  qrCodeBase64?: string;
  createdAt: string;
  paidAt?: string;
}

export class PaymentRepository {
  private inMemoryCharges: Map<string, PixChargeEntity> = new Map();

  constructor(private pool?: Pool | null) {}

  async saveCharge(charge: PixChargeEntity): Promise<PixChargeEntity> {
    this.inMemoryCharges.set(charge.txid, charge);
    if (this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO pix_charges (id, txid, order_id, tenant_slug, amount_cents, status, emv_payload, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (txid) DO UPDATE SET
             status = EXCLUDED.status,
             paid_at = EXCLUDED.paid_at;`,
          [
            charge.id,
            charge.txid,
            charge.orderId,
            charge.tenantSlug,
            charge.amountCents,
            charge.status,
            charge.emvPayload,
            charge.createdAt,
          ],
        );
      } catch {
        // fallback
      }
    }
    return charge;
  }

  async findByTxid(txid: string): Promise<PixChargeEntity | null> {
    if (this.pool) {
      try {
        const res = await this.pool.query('SELECT * FROM pix_charges WHERE txid = $1 LIMIT 1;', [txid]);
        if (res.rows[0]) {
          const r = res.rows[0];
          return {
            id: r.id,
            txid: r.txid,
            orderId: r.order_id,
            tenantSlug: r.tenant_slug,
            amountCents: r.amount_cents,
            status: r.status,
            emvPayload: r.emv_payload,
            createdAt: r.created_at,
            paidAt: r.paid_at,
          };
        }
      } catch {
        // fallback
      }
    }
    return this.inMemoryCharges.get(txid) || null;
  }

  async markAsPaid(txid: string): Promise<PixChargeEntity | null> {
    const charge = await this.findByTxid(txid);
    if (!charge) return null;

    const now = new Date().toISOString();
    charge.status = 'PAID';
    charge.paidAt = now;

    if (this.pool) {
      try {
        await this.pool.query(
          'UPDATE pix_charges SET status = $1, paid_at = $2 WHERE txid = $3;',
          ['PAID', now, txid],
        );
      } catch {
        // fallback
      }
    }

    this.inMemoryCharges.set(txid, charge);
    return charge;
  }
}
