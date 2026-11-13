import { describe, it, expect } from 'vitest';
import { OrderService } from '../../modules/orders/service.ts';
import { OrderRepository } from '../../modules/orders/repository.ts';

describe('Negative Integration Tests: Multi-Tenant Data Isolation', () => {
  const repository = new OrderRepository(null);
  const orderService = new OrderService(repository);

  it('strictly isolates orders between tenants: Tenant B cannot read Tenant A order', async () => {
    // 1. Tenant A (brasas-burger) creates an order
    const orderA = await orderService.createOrder({
      tenantSlug: 'brasas-burger',
      customerName: 'Cliente A',
      customerPhone: '11911112222',
      paymentMethod: 'pix',
      items: [{ productId: 'p1', productName: 'Burger A', quantity: 1, unitPriceCents: 2000, totalPriceCents: 2000 }],
    });

    expect(orderA.success).toBe(true);
    const orderId = orderA.data!.id;

    // 2. Tenant A can read its own order
    const readA = await orderService.getOrder(orderId, 'brasas-burger');
    expect(readA.success).toBe(true);
    expect(readA.data?.id).toBe(orderId);

    // 3. Tenant B (pizzaria-roma) attempts to query Tenant A's order -> MUST FAIL
    const readB = await orderService.getOrder(orderId, 'pizzaria-roma');
    expect(readB.success).toBe(false);
    expect(readB.statusCode).toBe(404);
  });

  it('strictly isolates order mutations: Tenant B cannot change status of Tenant A order', async () => {
    const orderA = await orderService.createOrder({
      tenantSlug: 'brasas-burger',
      customerName: 'Cliente A2',
      customerPhone: '11911112222',
      paymentMethod: 'pix',
      items: [{ productId: 'p1', productName: 'Burger A2', quantity: 1, unitPriceCents: 2000, totalPriceCents: 2000 }],
    });

    const orderId = orderA.data!.id;

    // Tenant B attempts to mutate status of Tenant A's order -> MUST BE REJECTED
    const mutateB = await orderService.updateOrderStatus(orderId, { status: 'cancelled' }, 'pizzaria-roma');
    expect(mutateB.success).toBe(false);
    expect(mutateB.statusCode).toBe(404);

    // Verify order in Tenant A was NOT altered
    const verifyA = await orderService.getOrder(orderId, 'brasas-burger');
    expect(verifyA.data?.status).toBe('pending');
  });

  it('tenant order listing returns only orders belonging to requested tenant', async () => {
    await orderService.createOrder({
      tenantSlug: 'tenant-alpha',
      customerName: 'Alpha Customer',
      customerPhone: '11900001111',
      paymentMethod: 'cash',
      items: [{ productId: 'p1', productName: 'Alpha Item', quantity: 1, unitPriceCents: 1000, totalPriceCents: 1000 }],
    });

    await orderService.createOrder({
      tenantSlug: 'tenant-beta',
      customerName: 'Beta Customer',
      customerPhone: '11900002222',
      paymentMethod: 'cash',
      items: [{ productId: 'p2', productName: 'Beta Item', quantity: 1, unitPriceCents: 1500, totalPriceCents: 1500 }],
    });

    const alphaOrders = await orderService.listTenantOrders('tenant-alpha');
    expect(alphaOrders.success).toBe(true);
    expect(alphaOrders.data?.every((o) => o.tenantSlug === 'tenant-alpha')).toBe(true);

    const betaOrders = await orderService.listTenantOrders('tenant-beta');
    expect(betaOrders.success).toBe(true);
    expect(betaOrders.data?.every((o) => o.tenantSlug === 'tenant-beta')).toBe(true);
  });
});
