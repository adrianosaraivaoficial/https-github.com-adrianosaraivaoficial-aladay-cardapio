import { describe, it, expect } from 'vitest';
import { OrderRepository } from '../../modules/orders/repository.ts';
import { TenantRepository } from '../../modules/tenants/repository.ts';
import { CatalogRepository } from '../../modules/catalog/repository.ts';

describe('Integration Tests: Repository Layer & Data Consistency', () => {
  it('tenant repository creates and retrieves multi-tenant entities', async () => {
    const tenantRepo = new TenantRepository(null);
    const tenant = await tenantRepo.save({
      id: 'tenant_it_01',
      name: 'Integration BBQ',
      slug: 'integration-bbq',
      phone: '11988887777',
      address: 'Rua dos Testes, 42',
      subscriptionStatus: 'active',
      createdAt: new Date().toISOString(),
    });

    expect(tenant.slug).toBe('integration-bbq');
    const found = await tenantRepo.findBySlug('integration-bbq');
    expect(found).not.toBeNull();
    expect(found?.name).toBe('Integration BBQ');
  });

  it('catalog repository saves and isolates product partitions by tenant', async () => {
    const catalogRepo = new CatalogRepository(null);
    await catalogRepo.saveCatalog(
      'integration-bbq',
      [{ id: 'cat_meats', name: 'Carnes Nobres', order: 1 }],
      [{ id: 'p_picanha', name: 'Picanha na Brasa', description: '500g', priceCents: 8900, categoryId: 'cat_meats', available: true }],
    );

    const catalog = await catalogRepo.getCatalog('integration-bbq');
    expect(catalog.categories.length).toBe(1);
    expect(catalog.products.length).toBe(1);
    expect(catalog.products[0].name).toBe('Picanha na Brasa');

    // Other tenant catalog remains clean
    const other = await catalogRepo.getCatalog('empty-tenant');
    expect(other.products.length).toBe(0);
  });

  it('order repository records transactional orders with outbox events', async () => {
    const orderRepo = new OrderRepository(null);
    const order = await orderRepo.createTransactionalOrder(
      {
        tenantSlug: 'integration-bbq',
        customerName: 'Cliente Teste',
        customerPhone: '11999990000',
        orderType: 'delivery',
        paymentMethod: 'pix',
        paymentStatus: 'pending',
        items: [{ productId: 'p1', productName: 'Item', quantity: 1, unitPriceCents: 1000, totalPriceCents: 1000 }],
        subtotalCents: 1000,
        deliveryFeeCents: 500,
        discountCents: 0,
        totalCents: 1500,
        status: 'pending',
      },
      {
        eventType: 'OrderCreated',
        payload: { orderId: 'test' },
      },
    );

    expect(order.id).toBeDefined();
    expect(order.orderNumber).toBeGreaterThanOrEqual(100);

    const fetched = await orderRepo.findById(order.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.totalCents).toBe(1500);
  });
});
