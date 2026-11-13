import { describe, it, expect } from 'vitest';
import { OrderRepository } from '../../modules/orders/repository.ts';
import { OrderService } from '../../modules/orders/service.ts';
import { PaymentRepository } from '../../modules/payments/repository.ts';
import { PaymentService } from '../../modules/payments/service.ts';
import { BillingRepository } from '../../modules/billing/repository.ts';
import { BillingService } from '../../modules/billing/service.ts';

describe('E2E Lifecycle Tests: Checkout, KDS, Pix, Tracking & Subscription', () => {
  it('executes full order lifecycle from customer checkout to KDS delivery', async () => {
    const orderRepo = new OrderRepository(null);
    const orderService = new OrderService(orderRepo);
    const paymentRepo = new PaymentRepository(null);
    const paymentService = new PaymentService(paymentRepo);

    // 1. Checkout: Customer places order
    const orderRes = await orderService.createOrder({
      tenantSlug: 'brasas-burger',
      customerName: 'Adriano Saraiva',
      customerPhone: '11988887777',
      orderType: 'delivery',
      deliveryAddress: 'Av. Paulista, 1000, Apto 42',
      paymentMethod: 'pix',
      items: [
        { productId: 'burger_01', productName: 'Duplo Bacon Smash', quantity: 2, unitPriceCents: 3500, totalPriceCents: 7000 },
        { productId: 'coca_01', productName: 'Coca Lata', quantity: 2, unitPriceCents: 750, totalPriceCents: 1500 },
      ],
      deliveryFeeCents: 800,
      discountCents: 0,
    });

    expect(orderRes.success).toBe(true);
    const order = orderRes.data!;
    expect(order.totalCents).toBe(9300); // (2*3500 + 2*750) + 800 = 8500 + 800 = 9300
    expect(order.status).toBe('pending');

    // 2. Pix Payment: Generate QR Code
    const pixRes = await paymentService.generatePix({
      orderId: order.id,
      tenantSlug: 'brasas-burger',
      amountCents: order.totalCents,
      customerName: order.customerName,
    });

    expect(pixRes.success).toBe(true);
    const txid = pixRes.data!.txid;

    // 3. Bank callback / Simulator confirms Pix payment
    const paymentSim = await paymentService.simulatePayment({ txid, orderId: order.id });
    expect(paymentSim.success).toBe(true);
    expect(paymentSim.data?.status).toBe('PAID');

    // 4. KDS: Kitchen staff moves order to PREPARING
    const kdsPrep = await orderService.updateOrderStatus(order.id, { status: 'preparing' }, 'brasas-burger');
    expect(kdsPrep.success).toBe(true);
    expect(kdsPrep.data?.status).toBe('preparing');

    // 5. KDS: Chef finishes burger -> READY
    const kdsReady = await orderService.updateOrderStatus(order.id, { status: 'ready' }, 'brasas-burger');
    expect(kdsReady.success).toBe(true);
    expect(kdsReady.data?.status).toBe('ready');

    // 6. Courier dispatches -> DELIVERED
    const kdsDelivered = await orderService.updateOrderStatus(order.id, { status: 'delivered' }, 'brasas-burger');
    expect(kdsDelivered.success).toBe(true);
    expect(kdsDelivered.data?.status).toBe('delivered');

    // 7. Customer Tracking: Query order status
    const tracking = await orderService.getOrder(order.id, 'brasas-burger');
    expect(tracking.success).toBe(true);
    expect(tracking.data?.status).toBe('delivered');
  });

  it('validates 15-day subscription trial rules and Asaas webhook activation', async () => {
    const billingRepo = new BillingRepository(null);
    const billingService = new BillingService(billingRepo);

    // Brand new tenant created today: trial is NOT expired
    const trialStatusNew = billingService.isTrialExpired(new Date().toISOString(), 15);
    expect(trialStatusNew.expired).toBe(false);
    expect(trialStatusNew.daysRemaining).toBe(15);

    // Old tenant created 20 days ago: trial IS expired
    const pastDate = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
    const trialStatusOld = billingService.isTrialExpired(pastDate, 15);
    expect(trialStatusOld.expired).toBe(true);
    expect(trialStatusOld.daysRemaining).toBe(0);

    // Asaas Webhook confirms payment -> subscription turns ACTIVE
    await billingService.getSubscription('brasas-burger');
    const webhookRes = await billingService.processWebhook({
      event: 'PAYMENT_RECEIVED',
      payment: {
        id: 'pay_999',
        customer: 'cus_999',
        externalReference: 'brasas-burger',
        status: 'RECEIVED',
      },
    });

    expect(webhookRes.success).toBe(true);
    const activeSub = await billingService.getSubscription('brasas-burger');
    expect(activeSub.data?.status).toBe('ACTIVE');
  });
});
