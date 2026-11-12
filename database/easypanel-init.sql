-- =============================================================================
-- ALADAY SAAS - SCRIPT OFICIAL DE INICIALIZAÇÃO DO POSTGRESQL NO EASYPANEL (VPS)
-- Multi-Tenant (Restaurantes, Categorias, Produtos, Pedidos, Pix e Outbox)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. TABELA DE RESTAURANTES (TENANTS)
CREATE TABLE IF NOT EXISTS tenants (
  id VARCHAR(80) PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  phone VARCHAR(30) NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  primary_color VARCHAR(20) NOT NULL DEFAULT '#EA580C',
  background_color VARCHAR(20) NOT NULL DEFAULT '#FAFAFA',
  font_family VARCHAR(60) NOT NULL DEFAULT 'Inter',
  logo_url TEXT,
  is_open BOOLEAN NOT NULL DEFAULT TRUE,
  opening_hours_text VARCHAR(200) DEFAULT 'Ter a Dom • 18h às 23h30',
  delivery_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  pickup_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  delivery_fee_cents INTEGER NOT NULL DEFAULT 0,
  min_order_cents INTEGER NOT NULL DEFAULT 0,
  delivery_zones JSONB NOT NULL DEFAULT '[]'::jsonb,
  evolution_instance_id VARCHAR(100) NOT NULL DEFAULT 'aladay',
  evolution_status VARCHAR(30) NOT NULL DEFAULT 'disconnected',
  subscription_status VARCHAR(30) NOT NULL DEFAULT 'active',
  trial_ends_at TIMESTAMPTZ,
  status_notification_templates JSONB NOT NULL DEFAULT '{}'::jsonb,
  pix_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS background_color VARCHAR(20) NOT NULL DEFAULT '#FAFAFA';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS font_family VARCHAR(60) NOT NULL DEFAULT 'Inter';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS opening_hours_text VARCHAR(200) DEFAULT 'Ter a Dom • 18h às 23h30';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS delivery_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS pickup_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS delivery_zones JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(30) NOT NULL DEFAULT 'active';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS status_notification_templates JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS pix_config JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);

-- 2. TABELA DE CATEGORIAS DO CARDÁPIO (ISOLADA POR TENANT)
CREATE TABLE IF NOT EXISTS categories (
  id VARCHAR(80) PRIMARY KEY,
  tenant_id VARCHAR(80) NOT NULL,
  tenant_slug VARCHAR(100) NOT NULL,
  name VARCHAR(120) NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE categories ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_categories_tenant_slug ON categories(tenant_slug);

-- 3. TABELA DE PRODUTOS E ADICIONAIS (ISOLADA POR TENANT)
CREATE TABLE IF NOT EXISTS products (
  id VARCHAR(80) PRIMARY KEY,
  tenant_id VARCHAR(80) NOT NULL,
  tenant_slug VARCHAR(100) NOT NULL,
  category_id VARCHAR(80) NOT NULL,
  name VARCHAR(150) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  image_url TEXT,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  option_groups JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS option_groups JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_products_tenant_slug ON products(tenant_slug);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);

-- 4. TABELA DE PEDIDOS (SNAPSHOT IMUTÁVEL DE ITENS E VALORES)
CREATE TABLE IF NOT EXISTS orders (
  id VARCHAR(80) PRIMARY KEY,
  order_number INTEGER NOT NULL,
  tenant_id VARCHAR(80) NOT NULL,
  tenant_slug VARCHAR(100) NOT NULL,
  customer_name VARCHAR(120) NOT NULL,
  customer_phone VARCHAR(30) NOT NULL,
  order_type VARCHAR(20) NOT NULL DEFAULT 'delivery',
  table_number VARCHAR(30),
  delivery_address TEXT,
  delivery_zone_name VARCHAR(100),
  estimated_minutes INTEGER DEFAULT 35,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  delivery_fee_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'received',
  payment_status VARCHAR(30) NOT NULL DEFAULT 'pending',
  payment_method VARCHAR(60) NOT NULL DEFAULT 'Pix',
  whatsapp_status VARCHAR(40) DEFAULT 'delivered',
  idempotency_key VARCHAR(120),
  pix_transaction JSONB,
  whatsapp_logs JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS table_number VARCHAR(30);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_zone_name VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS estimated_minutes INTEGER DEFAULT 35;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS whatsapp_status VARCHAR(40) DEFAULT 'delivered';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pix_transaction JSONB;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS whatsapp_logs JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_orders_tenant_slug ON orders(tenant_slug);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- 5. TABELA TRANSAÇÕES PIX DIRETO RESTAURANTE
CREATE TABLE IF NOT EXISTS pix_transactions (
  txid VARCHAR(80) PRIMARY KEY,
  order_id VARCHAR(80) NOT NULL,
  tenant_slug VARCHAR(100) NOT NULL,
  amount_cents INTEGER NOT NULL,
  pix_copia_e_cola TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  psp VARCHAR(60) DEFAULT 'direct_bank',
  customer_name VARCHAR(120),
  customer_phone VARCHAR(30),
  end_to_end_id VARCHAR(100),
  paid_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pix_tenant_slug ON pix_transactions(tenant_slug);

-- 6. TABELA OUTBOX PATTERN (FILA TRANSACIONAL DE EVENTOS PARA N8N / EVOLUTION API)
CREATE TABLE IF NOT EXISTS outbox_events (
  id VARCHAR(80) PRIMARY KEY,
  tenant_id VARCHAR(80) NOT NULL,
  aggregate_type VARCHAR(50) NOT NULL,
  aggregate_id VARCHAR(80) NOT NULL,
  event_type VARCHAR(80) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox_events(status);

-- 7. TABELA DE USUÁRIOS ASSINANTES (AUTENTICAÇÃO RBAC MULTI-TENANT)
CREATE TABLE IF NOT EXISTS subscriber_users (
  id VARCHAR(80) PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(160) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  phone VARCHAR(30) NOT NULL DEFAULT '',
  role VARCHAR(40) NOT NULL DEFAULT 'TENANT_OWNER',
  tenant_id VARCHAR(80) NOT NULL,
  tenant_slug VARCHAR(100) NOT NULL,
  tenant_name VARCHAR(150) NOT NULL DEFAULT '',
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriber_users_email ON subscriber_users(email);
CREATE INDEX IF NOT EXISTS idx_subscriber_users_tenant_slug ON subscriber_users(tenant_slug);

-- 8. TABELA DE ASSINATURAS SAAS ASAAS (MENSAL R$ 129,90 / ANUAL R$ 99,00 / TESTE 15 DIAS)
CREATE TABLE IF NOT EXISTS asaas_subscriptions (
  tenant_slug VARCHAR(100) PRIMARY KEY,
  subscription_id VARCHAR(120) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'PENDING',
  cycle VARCHAR(20) NOT NULL DEFAULT 'MONTHLY',
  billing_type VARCHAR(30) NOT NULL DEFAULT 'PIX',
  value NUMERIC(10, 2) NOT NULL DEFAULT 129.90,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Eventos de webhook processados de forma idempotente (Pix/Asaas/outros provedores)
CREATE TABLE IF NOT EXISTS webhook_events (
  provider VARCHAR(40) NOT NULL,
  event_id VARCHAR(180) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  payload_hash VARCHAR(64) NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (provider, event_id)
);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed_at ON webhook_events(processed_at);

-- Incremental hardening migration. Duplicate historical keys must be reconciled before rollout.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tables_count INTEGER NOT NULL DEFAULT 12;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS request_hash VARCHAR(64);
CREATE UNIQUE INDEX IF NOT EXISTS orders_tenant_idempotency_unique
  ON orders (tenant_slug, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pix_order_unique ON pix_transactions (order_id);
CREATE UNIQUE INDEX IF NOT EXISTS pix_end_to_end_unique ON pix_transactions (end_to_end_id) WHERE end_to_end_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS auth_sessions (
  id UUID PRIMARY KEY,
  user_id VARCHAR(80) NOT NULL REFERENCES subscriber_users(id),
  credential_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS auth_sessions_expiry ON auth_sessions(expires_at);
CREATE TABLE IF NOT EXISTS auth_otp (
  email VARCHAR(160) PRIMARY KEY,
  code_hash VARCHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS rate_limits (
  key VARCHAR(200) PRIMARY KEY,
  count INTEGER NOT NULL,
  reset_at TIMESTAMPTZ NOT NULL
);
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS available_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS lock_token UUID;
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS last_error VARCHAR(120);
CREATE INDEX IF NOT EXISTS outbox_available ON outbox_events(status, available_at);

CREATE TABLE IF NOT EXISTS billing_operations (
  tenant_slug VARCHAR(100) PRIMARY KEY,
  request_hash VARCHAR(64) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'processing',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- NOT VALID preserves historical rows while enforcing constraints on new writes.
CREATE UNIQUE INDEX IF NOT EXISTS tenants_identity_scope ON tenants(id,slug);
CREATE UNIQUE INDEX IF NOT EXISTS categories_identity_scope ON categories(id,tenant_slug);
CREATE UNIQUE INDEX IF NOT EXISTS orders_identity_scope ON orders(id,tenant_slug);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='categories_tenant_scope' AND conrelid='categories'::regclass) THEN
    ALTER TABLE categories ADD CONSTRAINT categories_tenant_scope FOREIGN KEY(tenant_id,tenant_slug) REFERENCES tenants(id,slug) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='products_tenant_scope' AND conrelid='products'::regclass) THEN
    ALTER TABLE products ADD CONSTRAINT products_tenant_scope FOREIGN KEY(tenant_id,tenant_slug) REFERENCES tenants(id,slug) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='products_category_scope' AND conrelid='products'::regclass) THEN
    ALTER TABLE products ADD CONSTRAINT products_category_scope FOREIGN KEY(category_id,tenant_slug) REFERENCES categories(id,tenant_slug) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='orders_tenant_scope' AND conrelid='orders'::regclass) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_tenant_scope FOREIGN KEY(tenant_id,tenant_slug) REFERENCES tenants(id,slug) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pix_order_scope' AND conrelid='pix_transactions'::regclass) THEN
    ALTER TABLE pix_transactions ADD CONSTRAINT pix_order_scope FOREIGN KEY(order_id,tenant_slug) REFERENCES orders(id,tenant_slug) NOT VALID;
  END IF;
END $$;

-- Paid access expires even when a provider's overdue webhook is delayed.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_access_until TIMESTAMPTZ;
