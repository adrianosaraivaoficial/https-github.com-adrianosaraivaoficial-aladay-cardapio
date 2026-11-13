import type { Pool } from 'pg';
import type { CreateOrderDto, OrderStatus } from './validation.ts';

export interface OrderEntity {
  id: string;
  orderNumber: number;
  tenantSlug: string;
  customerName: string;
  customerPhone: string;
  orderType: string;
  deliveryAddress?: string;
  tableNumber?: string;
  paymentMethod: string;
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded';
  items: any[];
  subtotalCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  totalCents: number;
  status: OrderStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export class OrderRepository {
  private inMemoryOrders: Map<string, OrderEntity> = new Map();
  private nextOrderNumber = 101;

  constructor(private pool?: Pool | null) {}

  async createTransactionalOrder(
    order: Omit<OrderEntity, 'id' | 'orderNumber' | 'createdAt' | 'updatedAt'>,
    outboxEvent?: { eventType: string; payload: any },
  ): Promise<OrderEntity> {
    const id = `order_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const orderNumber = this.nextOrderNumber++;
    const now = new Date().toISOString();

    const entity: OrderEntity = {
      ...order,
      id,
      orderNumber,
      createdAt: now,
      updatedAt: now,
    };

    if (this.pool) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN;');

        // 1. Insert order
        await client.query(
          `INSERT INTO orders (id, order_number, tenant_slug, customer_name, customer_phone, order_type, delivery_address, table_number, payment_method, payment_status, subtotal_cents, delivery_fee_cents, discount_cents, total_cents, status, notes, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18);`,
          [
            entity.id,
            entity.orderNumber,
            entity.tenantSlug,
            entity.customerName,
            entity.customerPhone,
            entity.orderType,
            entity.deliveryAddress || null,
            entity.tableNumber || null,
            entity.paymentMethod,
            entity.paymentStatus,
            entity.subtotalCents,
            entity.deliveryFeeCents,
            entity.discountCents,
            entity.totalCents,
            entity.status,
            entity.notes || null,
            entity.createdAt,
            entity.updatedAt,
          ],
        );

        // 2. Insert items
        for (const item of entity.items) {
          await client.query(
            `INSERT INTO order_items (id, order_id, product_id, product_name, quantity, unit_price_cents, total_price_cents, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
            [
              `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              entity.id,
              item.productId,
              item.productName,
              item.quantity,
              item.unitPriceCents,
              item.totalPriceCents,
              item.notes || null,
            ],
          );
        }

        // 3. Insert transactional outbox event
        if (outboxEvent) {
          await client.query(
            `INSERT INTO outbox_events (id, aggregate_type, aggregate_id, event_type, payload, status, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7);`,
            [
              `evt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              'Order',
              entity.id,
              outboxEvent.eventType,
              JSON.stringify(outboxEvent.payload),
              'PENDING',
              now,
            ],
          );
        }

        await client.query('COMMIT;');
      } catch (err) {
        await client.query('ROLLBACK;');
        throw err;
      } finally {
        client.release();
      }
    }

    this.inMemoryOrders.set(entity.id, entity);
    return entity;
  }

  async findById(orderId: string, tenantSlug?: string): Promise<OrderEntity | null> {
    if (this.pool) {
      try {
        const query = tenantSlug
          ? 'SELECT * FROM orders WHERE id = $1 AND tenant_slug = $2 LIMIT 1;'
          : 'SELECT * FROM orders WHERE id = $1 LIMIT 1;';
        const params = tenantSlug ? [orderId, tenantSlug] : [orderId];
        const res = await this.pool.query(query, params);
        if (res.rows[0]) {
          const row = res.rows[0];
          return this.mapDbRowToEntity(row);
        }
      } catch {
        // fallback
      }
    }

    const order = this.inMemoryOrders.get(orderId);
    if (!order) return null;
    if (tenantSlug && order.tenantSlug !== tenantSlug) return null;
    return order;
  }

  async listByTenant(tenantSlug: string, limit = 50): Promise<OrderEntity[]> {
    if (this.pool) {
      try {
        const res = await this.pool.query(
          'SELECT * FROM orders WHERE tenant_slug = $1 ORDER BY created_at DESC LIMIT $2;',
          [tenantSlug, limit],
        );
        if (res.rows.length > 0) {
          return res.rows.map(this.mapDbRowToEntity);
        }
      } catch {
        // fallback
      }
    }

    return Array.from(this.inMemoryOrders.values())
      .filter((o) => o.tenantSlug === tenantSlug)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  async updateStatus(orderId: string, status: OrderStatus, tenantSlug?: string): Promise<OrderEntity | null> {
    const order = await this.findById(orderId, tenantSlug);
    if (!order) return null;

    const now = new Date().toISOString();
    order.status = status;
    order.updatedAt = now;

    if (this.pool) {
      try {
        await this.pool.query(
          'UPDATE orders SET status = $1, updated_at = $2 WHERE id = $3;',
          [status, now, orderId],
        );
      } catch {
        // fallback
      }
    }

    this.inMemoryOrders.set(orderId, order);
    return order;
  }

  private mapDbRowToEntity(row: any): OrderEntity {
    return {
      id: row.id,
      orderNumber: row.order_number,
      tenantSlug: row.tenant_slug,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      orderType: row.order_type,
      deliveryAddress: row.delivery_address,
      tableNumber: row.table_number,
      paymentMethod: row.payment_method,
      paymentStatus: row.payment_status,
      items: Array.isArray(row.items) ? row.items : [],
      subtotalCents: row.subtotal_cents,
      deliveryFeeCents: row.delivery_fee_cents,
      discountCents: row.discount_cents,
      totalCents: row.total_cents,
      status: row.status,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
