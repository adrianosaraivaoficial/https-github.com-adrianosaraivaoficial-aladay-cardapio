import { describe, it, expect } from 'vitest';
import { OrderService } from '../../modules/orders/service.ts';
import { OrderRepository } from '../../modules/orders/repository.ts';

describe('Unit Tests: Pricing & Calculations', () => {
  const repository = new OrderRepository(null);
  const orderService = new OrderService(repository);

  it('calculates subtotal correctly for multiple items and quantities', () => {
    const dto: any = {
      tenantSlug: 'brasas-burger',
      customerName: 'Cliente Teste',
      customerPhone: '11999998888',
      orderType: 'delivery',
      paymentMethod: 'pix',
      items: [
        { productId: 'p1', productName: 'Smash Burger', quantity: 2, unitPriceCents: 3200, totalPriceCents: 6400 },
        { productId: 'p2', productName: 'Refrigerante', quantity: 1, unitPriceCents: 800, totalPriceCents: 800 },
      ],
      deliveryFeeCents: 500,
      discountCents: 200,
    };

    const { subtotalCents, totalCents } = orderService.calculatePrices(dto);

    expect(subtotalCents).toBe(7200); // 2 * 3200 + 1 * 800
    expect(totalCents).toBe(7500); // 7200 + 500 - 200
  });

  it('prevents negative values when discount exceeds total', () => {
    const dto: any = {
      tenantSlug: 'brasas-burger',
      customerName: 'Cliente Cupom',
      customerPhone: '11999998888',
      orderType: 'takeaway',
      paymentMethod: 'pix',
      items: [
        { productId: 'p1', productName: 'Café', quantity: 1, unitPriceCents: 500, totalPriceCents: 500 },
      ],
      deliveryFeeCents: 0,
      discountCents: 1500, // Discount higher than subtotal
    };

    const { subtotalCents, totalCents } = orderService.calculatePrices(dto);

    expect(subtotalCents).toBe(500);
    expect(totalCents).toBe(0); // Clamped to zero
  });

  it('ignores negative prices or quantities safely', () => {
    const dto: any = {
      tenantSlug: 'brasas-burger',
      customerName: 'Cliente Hack',
      customerPhone: '11999998888',
      orderType: 'takeaway',
      paymentMethod: 'cash',
      items: [
        { productId: 'p1', productName: 'Tentativa Negativa', quantity: 1, unitPriceCents: -500, totalPriceCents: 0 },
      ],
      deliveryFeeCents: -100,
      discountCents: -50,
    };

    const { subtotalCents, totalCents } = orderService.calculatePrices(dto);

    expect(subtotalCents).toBe(0);
    expect(totalCents).toBe(0);
  });
});
