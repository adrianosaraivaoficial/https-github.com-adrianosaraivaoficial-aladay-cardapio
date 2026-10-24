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
  status_notification_templates JSONB NOT NULL DEFAULT '{}'::jsonb,
  pix_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);

-- 2. TABELA DE CATEGORIAS DO CARDÁPIO (ISOLADA POR TENANT)
CREATE TABLE IF NOT EXISTS categories (
  id VARCHAR(80) PRIMARY KEY,
  tenant_id VARCHAR(80) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tenant_slug VARCHAR(100) NOT NULL,
  name VARCHAR(120) NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_categories_tenant_slug ON categories(tenant_slug);

-- 3. TABELA DE PRODUTOS E ADICIONAIS (ISOLADA POR TENANT)
CREATE TABLE IF NOT EXISTS products (
  id VARCHAR(80) PRIMARY KEY,
  tenant_id VARCHAR(80) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_products_tenant_slug ON products(tenant_slug);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);

-- 4. TABELA DE PEDIDOS (SNAPSHOT IMUTÁVEL DE ITENS E VALORES)
CREATE TABLE IF NOT EXISTS orders (
  id VARCHAR(80) PRIMARY KEY,
  order_number INTEGER NOT NULL,
  tenant_id VARCHAR(80) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tenant_slug VARCHAR(100) NOT NULL,
  customer_name VARCHAR(120) NOT NULL,
  customer_phone VARCHAR(30) NOT NULL,
  order_type VARCHAR(20) NOT NULL DEFAULT 'delivery',
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
  idempotency_key VARCHAR(120) UNIQUE,
  pix_transaction JSONB,
  whatsapp_logs JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
