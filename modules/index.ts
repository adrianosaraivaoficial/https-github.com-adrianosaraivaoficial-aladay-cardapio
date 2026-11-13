import type { Application } from 'express';
import type { Pool } from 'pg';

import { AuthRepository, AuthService, createAuthRouter } from './auth/index.ts';
import { TenantRepository, TenantService, createTenantsRouter } from './tenants/index.ts';
import { CatalogRepository, CatalogService, createCatalogRouter } from './catalog/index.ts';
import { OrderRepository, OrderService, createOrdersRouter } from './orders/index.ts';
import { PaymentRepository, PaymentService, createPaymentsRouter } from './payments/index.ts';
import { BillingRepository, BillingService, createBillingRouter } from './billing/index.ts';
import { WhatsAppRepository, WhatsAppService, createWhatsAppRouter } from './whatsapp/index.ts';
import { IfoodRepository, IfoodService, createIfoodRouter } from './ifood/index.ts';
import { WebhookRepository, WebhookService, createWebhooksRouter } from './webhooks/index.ts';

export interface ModularMonolithServices {
  authService: AuthService;
  tenantService: TenantService;
  catalogService: CatalogService;
  orderService: OrderService;
  paymentService: PaymentService;
  billingService: BillingService;
  whatsAppService: WhatsAppService;
  ifoodService: IfoodService;
  webhookService: WebhookService;
}

export function initializeModularMonolith(
  app: Application,
  dbPool?: Pool | null,
  redisCoordinator?: any,
): ModularMonolithServices {
  // Repositories
  const authRepo = new AuthRepository(dbPool);
  const tenantRepo = new TenantRepository(dbPool);
  const catalogRepo = new CatalogRepository(dbPool);
  const orderRepo = new OrderRepository(dbPool);
  const paymentRepo = new PaymentRepository(dbPool);
  const billingRepo = new BillingRepository(dbPool);
  const whatsAppRepo = new WhatsAppRepository(dbPool);
  const ifoodRepo = new IfoodRepository(dbPool);
  const webhookRepo = new WebhookRepository();

  // Services
  const authService = new AuthService(authRepo, redisCoordinator);
  const tenantService = new TenantService(tenantRepo);
  const catalogService = new CatalogService(catalogRepo);
  const orderService = new OrderService(orderRepo);
  const paymentService = new PaymentService(paymentRepo);
  const billingService = new BillingService(billingRepo);
  const whatsAppService = new WhatsAppService(whatsAppRepo);
  const ifoodService = new IfoodService(ifoodRepo);
  const webhookService = new WebhookService(webhookRepo);

  // Mount Modular Routes under /api/v2/
  app.use('/api/v2/auth', createAuthRouter(authService));
  app.use('/api/v2/tenants', createTenantsRouter(tenantService));
  app.use('/api/v2/catalog', createCatalogRouter(catalogService));
  app.use('/api/v2/orders', createOrdersRouter(orderService));
  app.use('/api/v2/payments', createPaymentsRouter(paymentService));
  app.use('/api/v2/billing', createBillingRouter(billingService));
  app.use('/api/v2/whatsapp', createWhatsAppRouter(whatsAppService));
  app.use('/api/v2/ifood', createIfoodRouter(ifoodService));
  app.use('/api/v2/webhooks', createWebhooksRouter(webhookService, authService));

  return {
    authService,
    tenantService,
    catalogService,
    orderService,
    paymentService,
    billingService,
    whatsAppService,
    ifoodService,
    webhookService,
  };
}

export * from './auth/index.ts';
export * from './tenants/index.ts';
export * from './catalog/index.ts';
export * from './orders/index.ts';
export * from './payments/index.ts';
export * from './billing/index.ts';
export * from './whatsapp/index.ts';
export * from './ifood/index.ts';
export * from './webhooks/index.ts';
