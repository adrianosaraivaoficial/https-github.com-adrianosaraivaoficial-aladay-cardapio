import { describe, it, expect } from 'vitest';
import { OrderService } from '../../modules/orders/service.ts';
import { OrderRepository } from '../../modules/orders/repository.ts';

describe('Unit Tests: Order Status & KDS Transitions', () => {
  const repository = new OrderRepository(null);
  const orderService = new OrderService(repository);

  it('progresses order from pending to preparing to ready to delivered', async () => {
    const createRes = await orderService.createOrder({
      tenantSlug: 'brasas-burger',
      customerName: 'Cliente KDS',
      customerPhone: '11988887777',
      paymentMethod: 'pix',
      items: [{ productId: 'p1', productName: 'Burger', quantity: 1, unitPriceCents: 3000, totalPriceCents: 3000 }],
    });

    expect(createRes.success).toBe(true);
    const orderId = createRes.data!.id;
    expect(createRes.data!.status).toBe('pending');

    // Transition to preparing
    const prepRes = await orderService.updateOrderStatus(orderId, { status: 'preparing' }, 'brasas-burger');
    expect(prepRes.success).toBe(true);
    expect(prepRes.data!.status).toBe('preparing');

    // Transition to ready
    const readyRes = await orderService.updateOrderStatus(orderId, { status: 'ready' }, 'brasas-burger');
    expect(readyRes.success).toBe(true);
    expect(readyRes.data!.status).toBe('ready');

    // Transition to delivered
    const delRes = await orderService.updateOrderStatus(orderId, { status: 'delivered' }, 'brasas-burger');
    expect(delRes.success).toBe(true);
    expect(delRes.data!.status).toBe('delivered');
  });

  it('prevents modifying cancelled orders', async () => {
    const createRes = await orderService.createOrder({
      tenantSlug: 'brasas-burger',
      customerName: 'Cliente Cancelar',
      customerPhone: '11988887777',
      paymentMethod: 'credit_card',
      items: [{ productId: 'p1', productName: 'Pizza', quantity: 1, unitPriceCents: 4000, totalPriceCents: 4000 }],
    });

    const orderId = createRes.data!.id;

    // Cancel order
    await orderService.updateOrderStatus(orderId, { status: 'cancelled' }, 'brasas-burger');

    // Attempt to reopen to preparing should fail
    const mutateRes = await orderService.updateOrderStatus(orderId, { status: 'preparing' }, 'brasas-burger');
    expect(mutateRes.success).toBe(false);
    expect(mutateRes.error).toContain('cancelados');
  });
});
