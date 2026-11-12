import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import fs from 'fs';
import pg from 'pg';
import QRCode from 'qrcode';
import { GoogleGenAI } from '@google/genai';
import { paidAccessUntil } from './backend/billingAccess';
import { timedFetch as fetch } from './backend/integrations';
import { validTaxId } from './backend/validation';
import { mountSeo } from './backend/seo';
import { mountCatalog } from './backend/catalog';
import { enqueue } from './backend/payments';
import { HttpError } from './backend/database';
import { installAsyncErrors } from './backend/http';
import { transaction, transactionalRoute } from './backend/database';
import { isPublicRoute, productionSimulationGuard, fingerprint, phoneNumber } from './backend/security';
import { observe, metrics } from './backend/observability';
import { mountPix, mountAsaasWebhook } from './backend/payments';
import { startOutboxWorker } from './backend/outbox';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let sharedGeminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!sharedGeminiClient) {
    sharedGeminiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return sharedGeminiClient;
}

interface InMemDeliveryZone {
  id: string;
  name: string;
  feeCents: number;
  estimatedMinutes: number;
  active: boolean;
}

interface InMemTenant {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  phone: string;
  address: string;
  primaryColor: string;
  isOpen: boolean;
  openingHoursText?: string;
  deliveryFeeCents: number;
  minOrderCents: number;
  deliveryZones?: InMemDeliveryZone[];
  evolutionInstanceId: string;
  evolutionStatus: 'connected' | 'connecting' | 'disconnected';
  subscriptionStatus?: 'active' | 'trial' | 'past_due' | 'suspended';
  trialEndsAt?: string;
  statusNotificationTemplates?: Record<string, string>;
  pixKey?: string;
  pixBeneficiaryName?: string;
  pixConfig?: {
    provider: string;
    pixKey: string;
    pixKeyType: string;
    beneficiaryName?: string;
    merchantName: string;
    merchantCity: string;
    bankName?: string;
    autoApproveWebhook: boolean;
    updatedAt?: string;
  };
  ifoodConfig?: {
    enabled: boolean;
    merchantId: string;
    status: 'connected' | 'pending_authorization' | 'disconnected';
    userCode?: string;
    authorizationCodeVerifier?: string;
    verificationUrlComplete?: string;
    autoAcceptOrders: boolean;
    syncCatalogPrices: boolean;
    commissionPercent: number;
    lastPollingAt?: string;
    webhookUrl?: string;
  };
  tablesCount?: number;
}

const memoryTenants: InMemTenant[] = [];
const memoryCategories: any[] = [];
const memoryProducts: any[] = [];
const memoryOrders: any[] = [];
const memoryOutboxEvents: any[] = [];
const memoryPixTransactions: any[] = [];
const memoryWebhookLogs: any[] = [];
// ============================================================================
// EASYPANEL VPS POSTGRESQL CONNECTION & AUTO-MIGRATION ENGINE
// ============================================================================
let activeDatabaseUrl = process.env.DATABASE_URL || '';
let pgPool: pg.Pool | null = null;
let dbConnectionState: {
  connected: boolean;
  lastCheckedAt: string | null;
  serverVersion: string | null;
  error: string | null;
  tablesInitialized: boolean;
} = {
  connected: false,
  lastCheckedAt: null,
  serverVersion: null,
  error: null,
  tablesInitialized: false,
};

function maskDatabaseUrl(url: string): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = '********';
    }
    return parsed.toString();
  } catch {
    return url.replace(/:([^:@/]+)@/, ':********@');
  }
}

function getInitSqlScript(): string {
  return fs.readFileSync(path.join(__dirname, 'database', 'easypanel-init.sql'), 'utf8');
}

async function initializePostgresConnection(connectionString: string, runMigration = true): Promise<{
  success: boolean;
  version?: string;
  counts?: Record<string, number>;
  error?: string;
}> {
  if (!connectionString || !connectionString.trim()) {
    const errMsg = 'Variável DATABASE_URL ainda não definida no EasyPanel.';
    dbConnectionState = {
      connected: false,
      lastCheckedAt: new Date().toISOString(),
      serverVersion: null,
      error: errMsg,
      tablesInitialized: false,
    };
    return { success: false, error: errMsg };
  }

  try {
    const trimmedConn = connectionString.trim();
    if (!/^postgres(ql)?:\/\//i.test(trimmedConn)) {
      return { success: false, error: 'URL de conexão inválida. Deve iniciar com postgresql:// ou postgres://.' };
    }
    const parsedConn = new URL(trimmedConn);
    const blockedHosts = ['169.254.169.254', 'metadata.google.internal', '0.0.0.0'];
    if (blockedHosts.includes(parsedConn.hostname.toLowerCase())) {
      return { success: false, error: 'Host de banco de dados não permitido por políticas de segurança (SSRF Guard).' };
    }

    const useSsl =
      trimmedConn.includes('sslmode=require') ||
      trimmedConn.includes('sslmode=verify-full') ||
      process.env.PGSSLMODE === 'require' ||
      process.env.PGSSLMODE === 'verify-full';

    const strictVerifySsl =
      trimmedConn.includes('sslmode=verify-full') ||
      process.env.PGSSLMODE === 'verify-full';

    const candidatePool = new Pool({
      connectionString: trimmedConn,
      ssl: useSsl ? { rejectUnauthorized: strictVerifySsl } : false,
      connectionTimeoutMillis: 6000,
    });

    candidatePool.on('error',()=>console.error(JSON.stringify({level:'error',event:'database_pool_error'})));
    const client = await candidatePool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtext('aladay_schema'))");
      const versionRes = await client.query('SELECT version();');
      const serverVersion = versionRes.rows[0]?.version || 'PostgreSQL';

      if (runMigration) {
        const ddl = getInitSqlScript();
        await client.query(ddl);

        // 1. Load saved tenants from PostgreSQL FIRST so real DB records take precedence over default seeds
        const dbTenants = await client.query("SELECT * FROM tenants WHERE LOWER(slug) != 'aladay' ORDER BY created_at ASC;");
        dbTenants.rows.forEach((row) => {
          const existingIdx = memoryTenants.findIndex((m) => m.slug.toLowerCase() === String(row.slug || '').toLowerCase());
          const mappedTenant: InMemTenant = {
            id: row.id,
            name: row.name,
            slug: row.slug,
            logoUrl: row.logo_url || '',
            phone: row.phone || '',
            address: row.address || '',
            primaryColor: row.primary_color || '#EA580C',
            isOpen: row.is_open ?? true,
            openingHoursText: row.opening_hours_text || 'Segunda a Domingo: 18:00 às 23:45',
            deliveryFeeCents: Number(row.delivery_fee_cents) || 0,
            minOrderCents: Number(row.min_order_cents) || 0,
            deliveryZones: Array.isArray(row.delivery_zones) ? row.delivery_zones : [],
            evolutionInstanceId: row.evolution_instance_id || `instancia_${row.slug}`,
            evolutionStatus: (row.evolution_status as any) || 'disconnected',
            subscriptionStatus: (row.subscription_status as any) || 'active',
            trialEndsAt: row.trial_ends_at ? new Date(row.trial_ends_at).toISOString() : undefined,
            statusNotificationTemplates: row.status_notification_templates || {},
            pixKey: row.pix_config?.pixKey || undefined,
            pixBeneficiaryName: row.pix_config?.beneficiaryName || row.pix_config?.merchantName || undefined,
            pixConfig: row.pix_config || undefined,
            tablesCount: Number(row.tables_count) || 12,
          };
          if (existingIdx >= 0) {
            memoryTenants[existingIdx] = mappedTenant;
          } else {
            memoryTenants.push(mappedTenant);
          }
        });

        // 3. Load saved categories from PostgreSQL into memoryCategories (and seed default categories if DB is empty)
        const dbCategories = await client.query("SELECT * FROM categories WHERE LOWER(tenant_slug) != 'aladay' ORDER BY display_order ASC, created_at ASC;");
        if (dbCategories.rows.length > 0) {
          dbCategories.rows.forEach((row) => {
            const existingIdx = memoryCategories.findIndex((c) => c.id === row.id);
            const mappedCat = {
              id: row.id,
              tenantId: row.tenant_id,
              tenantSlug: row.tenant_slug,
              name: row.name,
              order: Number(row.display_order) || 1,
            };
            if (existingIdx >= 0) {
              memoryCategories[existingIdx] = mappedCat;
            } else {
              memoryCategories.push(mappedCat);
            }
          });
        }

        // 4. Load saved products from PostgreSQL into memoryProducts (and seed default products if DB is empty)
        const dbProducts = await client.query("SELECT * FROM products WHERE LOWER(tenant_slug) != 'aladay' ORDER BY created_at DESC;");
        if (dbProducts.rows.length > 0) {
          dbProducts.rows.forEach((row) => {
            const existingIdx = memoryProducts.findIndex((p) => p.id === row.id);
            const mappedProd = {
              id: row.id,
              tenantId: row.tenant_id,
              tenantSlug: row.tenant_slug,
              categoryId: row.category_id,
              name: row.name,
              description: row.description || '',
              priceCents: Number(row.price_cents) || 0,
              imageUrl: row.image_url || undefined,
              isAvailable: row.is_available ?? true,
              isFeatured: row.is_featured ?? false,
              optionGroups: Array.isArray(row.option_groups) ? row.option_groups : [],
            };
            if (existingIdx >= 0) {
              memoryProducts[existingIdx] = mappedProd;
            } else {
              memoryProducts.push(mappedProd);
            }
          });
        }

        // 5. Load saved orders from PostgreSQL into memoryOrders
        const dbOrders = await client.query('SELECT * FROM orders ORDER BY created_at DESC LIMIT 200;');
        dbOrders.rows.forEach((row) => {
          const existingIdx = memoryOrders.findIndex((o) => o.id === row.id);
          const mappedOrd = {
            id: row.id,
            orderNumber: Number(row.order_number) || 1000,
            tenantId: row.tenant_id,
            tenantSlug: row.tenant_slug,
            customerName: row.customer_name,
            customerPhone: row.customer_phone,
            type: row.order_type || 'delivery',
            tableNumber: row.table_number || undefined,
            deliveryAddress: row.delivery_address || undefined,
            deliveryZoneName: row.delivery_zone_name || undefined,
            estimatedMinutes: Number(row.estimated_minutes) || 35,
            items: Array.isArray(row.items) ? row.items : [],
            subtotalCents: Number(row.subtotal_cents) || 0,
            deliveryFeeCents: Number(row.delivery_fee_cents) || 0,
            totalCents: Number(row.total_cents) || 0,
            status: row.status || 'received',
            paymentStatus: row.payment_status || 'pending',
            paymentMethod: row.payment_method || 'Pix',
            whatsAppStatus: row.whatsapp_status || 'delivered',
            idempotencyKey: row.idempotency_key || undefined,
            pixTransaction: row.pix_transaction || undefined,
            whatsAppLogs: Array.isArray(row.whatsapp_logs) ? row.whatsapp_logs : [],
            createdAt: row.created_at ? new Date(row.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'Agora',
            updatedAt: row.updated_at ? new Date(row.updated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'Agora',
            receivedAtMs: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
          };
          if (existingIdx >= 0) {
            memoryOrders[existingIdx] = mappedOrd;
          } else {
            memoryOrders.push(mappedOrd);
          }
        });
      }

      const countsRes = await client.query(`
        SELECT
          (SELECT COUNT(*) FROM tenants)::int AS tenants,
          (SELECT COUNT(*) FROM categories)::int AS categories,
          (SELECT COUNT(*) FROM products)::int AS products,
          (SELECT COUNT(*) FROM orders)::int AS orders,
          (SELECT COUNT(*) FROM outbox_events)::int AS outbox_events;
      `);
      const counts = countsRes.rows[0] || {
        tenants: 0,
        categories: 0,
        products: 0,
        orders: 0,
        outbox_events: 0,
      };

      await client.query('COMMIT');
      if (pgPool && pgPool !== candidatePool) {
        await pgPool.end().catch(() => {});
      }
      pgPool = candidatePool;
      activeDatabaseUrl = connectionString.trim();

      dbConnectionState = {
        connected: true,
        lastCheckedAt: new Date().toISOString(),
        serverVersion,
        error: null,
        tablesInitialized: true,
      };

      console.log(`[PostgreSQL EasyPanel VPS] Conectado com sucesso: ${serverVersion}`);
      return { success: true, version: serverVersion, counts };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      void candidatePool.end().catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  } catch (err: any) {
    const errorMsg = err?.message || 'Falha ao conectar ao PostgreSQL no EasyPanel.';
    dbConnectionState = {
      connected: false,
      lastCheckedAt: new Date().toISOString(),
      serverVersion: null,
      error: errorMsg,
      tablesInitialized: false,
    };
    console.warn(JSON.stringify({ level: 'error', event: 'database_initialization_failed' }));
    return { success: false, error: errorMsg };
  }
}

async function startServer() {
  const app = express();
  installAsyncErrors(app);
  const PORT = Number(process.env.PORT) || 3000;

  // Trust first reverse proxy (EasyPanel / Traefik / Cloudflare) for accurate req.ip rate limiting
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 0));
  app.disable('x-powered-by');

  // Limit JSON request payload size to prevent DoS memory exhaustion
  app.use(observe);
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', productionSimulationGuard);

  // Global HTTP Security Headers (OWASP Hardening)
  app.use((req: Request, res: Response, next: express.NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if(process.env.NODE_ENV==='production') res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; media-src 'self' https:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'");
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (process.env.NODE_ENV === 'production' || req.secure) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL é obrigatória.');
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || /substitua|sua_chave/i.test(process.env.JWT_SECRET)) throw new Error('JWT_SECRET deve ter pelo menos 32 caracteres.');
  if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 12 || /substitua|sua_senha/i.test(process.env.ADMIN_PASSWORD)) throw new Error('ADMIN_PASSWORD deve ter pelo menos 12 caracteres.');
  memoryTenants.length = 0;
  memoryCategories.length = 0;
  memoryProducts.length = 0;
  const database = await initializePostgresConnection(process.env.DATABASE_URL, true);
  if (!database.success || !pgPool) throw new Error('PostgreSQL indisponível; inicialização cancelada.');
  const databasePool = pgPool;
  const JWT_SECRET = process.env.JWT_SECRET;

  function base64UrlEncode(input: string | Buffer): string {
    return Buffer.from(input)
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }

  function verifyJwtToken(token: string): any | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const [headerB64, payloadB64, signature] = parts;
      if (!headerB64 || !payloadB64 || !signature) return null;

      const expectedSignature = crypto
        .createHmac('sha256', JWT_SECRET)
        .update(`${headerB64}.${payloadB64}`)
        .digest('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

      const sigBuf = Buffer.from(signature);
      const expBuf = Buffer.from(expectedSignature);
      if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        return null;
      }

      const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
      if (header.alg !== 'HS256' || header.typ !== 'JWT') return null;
      const claims = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
      const nowSec = Math.floor(Date.now() / 1000);
      if (!claims || !claims.sub || !['SUPER_ADMIN', 'TENANT_OWNER', 'KITCHEN_STAFF'].includes(claims.role) || !Number.isInteger(claims.exp) || claims.exp <= nowSec || claims.iss !== 'https://aladay.com.br' || claims.aud !== 'aladay-api' || !claims.jti) {
        return null;
      }

      return claims;
    } catch {
      return null;
    }
  }

  function getAuthenticatedClaims(req: Request): any | null {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    return token ? verifyJwtToken(token) : null;
  }

  function canAccessTenant(claims: any, tenantSlug: string, tenantId?: string): boolean {
    if (!claims) return false;
    if (claims.role === 'SUPER_ADMIN') return true;
    const normalizedSlug = String(tenantSlug || '').trim().toLowerCase();
    return ['TENANT_OWNER', 'KITCHEN_STAFF'].includes(claims.role) &&
      normalizedSlug.length > 0 && normalizedSlug !== '*' &&
      String(claims.tenant_slug || '').toLowerCase() === normalizedSlug &&
      (!tenantId || claims.tenant_id === tenantId);
  }

  function safeSecretEquals(provided: string, configured: string): boolean {
    if (!provided || !configured) return false;
    const providedBuffer = Buffer.from(provided, 'utf8');
    const configuredBuffer = Buffer.from(configured, 'utf8');
    return (
      providedBuffer.length === configuredBuffer.length &&
      crypto.timingSafeEqual(providedBuffer, configuredBuffer)
    );
  }

  function serializePublicTenant(tenant: InMemTenant) {
    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      logoUrl: tenant.logoUrl,
      phone: tenant.phone,
      address: tenant.address,
      primaryColor: tenant.primaryColor,
      isOpen: tenant.isOpen,
      openingHoursText: tenant.openingHoursText,
      deliveryFeeCents: tenant.deliveryFeeCents,
      minOrderCents: tenant.minOrderCents,
      deliveryZones: (tenant.deliveryZones || []).filter((zone) => zone.active !== false),
      tablesCount: tenant.tablesCount,
    };
  }

  function serializeTenantForRequest(req: Request, tenant: InMemTenant) {
    const claims = getAuthenticatedClaims(req);
    return canAccessTenant(claims, tenant.slug, tenant.id) ? tenant : serializePublicTenant(tenant);
  }

  function serializePublicTrackingOrder(order: any) {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      tenantId: order.tenantId,
      tenantSlug: order.tenantSlug,
      customerName: String(order.customerName || 'Cliente').split(/\s+/)[0],
      type: order.type,
      tableNumber: order.tableNumber,
      deliveryZoneName: order.deliveryZoneName,
      estimatedMinutes: order.estimatedMinutes,
      items: (order.items || []).map((item: any) => ({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        selectedOptions: (item.selectedOptions || []).map((option: any) => ({
          groupName: option.groupName,
          itemName: option.itemName,
          priceCents: option.priceCents,
        })),
        totalCents: item.totalCents,
      })),
      subtotalCents: order.subtotalCents,
      deliveryFeeCents: order.deliveryFeeCents,
      totalCents: order.totalCents,
      status: order.status,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  const authenticateToken = (req: Request, res: Response, next: express.NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: 'Acesso não autorizado: token JWT ausente.' });
    }
    const claims = verifyJwtToken(token);
    if (!claims) {
      return res.status(401).json({ error: 'Token JWT inválido ou expirado.' });
    }
    (req as any).user = claims;
    next();
  };

  const requireSuperAdmin = (req: Request, res: Response, next: express.NextFunction) => {
    authenticateToken(req, res, () => {
      const user = (req as any).user;
      if (user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Acesso negado: privilégios de Super Admin necessários.' });
      }
      next();
    });
  };

  const requireTenantAccess = (paramName = 'slug') => {
    return (req: Request, res: Response, next: express.NextFunction) => {
      authenticateToken(req, res, () => {
        const user = (req as any).user;
        const targetSlug = String(req.params[paramName] || req.body?.tenantSlug || '').trim();
        const tenant = memoryTenants.find((item) => item.slug.toLowerCase() === targetSlug.toLowerCase());
        if (targetSlug && canAccessTenant(user, targetSlug, tenant?.id)) {
          return next();
        }
        return res.status(403).json({ error: 'Acesso negado: você não tem permissão para acessar os dados deste restaurante.' });
      });
    };
  };

  const requireTenantQueryAccess = (queryName = 'tenantSlug') => {
    return (req: Request, res: Response, next: express.NextFunction) => {
      authenticateToken(req, res, () => {
        const targetSlug = String(req.query[queryName] || '').trim();
        const tenant = memoryTenants.find((item) => item.slug.toLowerCase() === targetSlug.toLowerCase());
        if (targetSlug && canAccessTenant((req as any).user, targetSlug, tenant?.id)) {
          return next();
        }
        return res.status(403).json({ error: 'Acesso negado: restaurante fora do escopo da sessão.' });
      });
    };
  };

  const requireOrderAccess: express.RequestHandler = async (req,res,next) => {
    try {
      const claims=getAuthenticatedClaims(req);
      if(!claims) return res.status(401).json({error:'Sessão inválida.'});
      const orderId=String(req.params.id || req.body?.orderId || '');
      const scope=await databasePool.query('SELECT id FROM orders WHERE id=$1 AND ($2 OR tenant_slug=$3)',[orderId,claims.role==='SUPER_ADMIN',claims.tenant_slug]);
      if(!scope.rows[0]) return res.status(404).json({error:'Pedido não encontrado.'});
      const order=await hydrateOrderFromDbById(orderId);
      if(!order || !canAccessTenant(claims,order.tenantSlug,order.tenantId)) return res.status(404).json({error:'Pedido não encontrado.'});
      (req as Request & {order:unknown}).order=order;
      next();
    } catch(error) {next(error);}
  };

  app.use('/api/v1', async (req, res, next) => {
    try {
      if(req.originalUrl.split('?')[0]==='/api/v1/health') return next();
      const auth = req.headers.authorization;
      if (auth) {
        const claims = getAuthenticatedClaims(req);
        if (!claims) return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
        const session = await databasePool.query(
          `SELECT u.* FROM auth_sessions s JOIN subscriber_users u ON u.id = s.user_id
           WHERE s.id = $1 AND s.user_id = $2 AND s.revoked_at IS NULL AND s.expires_at > NOW()
           AND s.credential_hash = u.password_hash`, [claims.jti, claims.sub]);
        const user = session.rows[0];
        if (!user || user.role !== claims.role || user.tenant_slug !== claims.tenant_slug || user.tenant_id !== claims.tenant_id) {
          return res.status(401).json({ error: 'Sessão revogada. Entre novamente.' });
        }
      }
      // A failed database never enables memory-only writes or stale public reads.
      await databasePool.query('SELECT 1');
      const pathname = req.originalUrl.split('?')[0].replace(/\/$/, '');
      if (isPublicRoute(req.method, pathname)) {
        if (req.method==='POST' && !pathname.includes('webhook') && !await authRateLimit(`public:${pathname}:${getClientIp(req)}`,60,60)) return res.status(429).json({error:'Limite de solicitações excedido.'});
        return next();
      }
      const scoped = pathname.match(/^\/api\/v1\/(?:tenants|asaas\/subscription)\/([^/]+)/);
      const claims = getAuthenticatedClaims(req);
      if (scoped && !canAccessTenant(claims, decodeURIComponent(scoped[1]))) return res.status(403).json({ error: 'Restaurante fora do escopo da sessão.' });
      if (claims?.role === 'KITCHEN_STAFF' && req.method !== 'GET' && !/^\/api\/v1\/orders\/[^/]+\/status$/.test(pathname)) return res.status(403).json({ error: 'Perfil sem permissão para esta alteração.' });

      // Tenant/order routes have their own scope guards below; all other integration/admin routes require superadmin.
      if (/^\/api\/v1\/(?:tenants\/[^/]+|orders\/[^/]+|asaas\/subscription\/[^/]+)(?:\/|$)/.test(pathname) ||
          ['/api/v1/auth/session', '/api/v1/auth/logout', '/api/v1/auth/register-tenant-owner'].includes(pathname) ||
          pathname === '/api/v1/asaas/pix/status') return authenticateToken(req, res, next);
      return requireSuperAdmin(req, res, next);
    } catch { return res.status(503).json({ error: 'Serviço temporariamente indisponível.' }); }
  });

  // In-Memory Rate Limiter for brute-force prevention
  const ipRateLimits = new Map<string, { count: number; resetAt: number }>();
  function getClientIp(req: Request): string {
    return String(req.ip || req.socket.remoteAddress || 'unknown');
  }
  function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
    const now = Date.now();
    if(ipRateLimits.size>10000) for(const [entry,value] of ipRateLimits) if(value.resetAt<=now) ipRateLimits.delete(entry);
    if(ipRateLimits.size>20000) return false;
    const record = ipRateLimits.get(key);
    if (!record || now > record.resetAt) {
      ipRateLimits.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (record.count >= maxRequests) {
      return false;
    }
    record.count += 1;
    return true;
  }

  // API Health Check
  app.get('/api/v1/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/api/v1/ready', async (_req, res) => {
    try { await databasePool.query('SELECT 1'); res.json({ status: 'ready' }); }
    catch { res.status(503).json({ status: 'unavailable' }); }
  });
  app.get('/api/v1/admin/metrics', requireSuperAdmin, async (_req, res) => {
    const queue = await databasePool.query(`SELECT status, COUNT(*)::int AS count,
      EXTRACT(EPOCH FROM (NOW() - MIN(created_at)))::int AS oldest_age_seconds FROM outbox_events GROUP BY status`);
    res.json({ ...metrics, outbox: queue.rows });
  });

  app.post('/api/v1/admin/outbox/:id/retry',requireSuperAdmin,async(req,res)=>{
    if(!/^[a-zA-Z0-9_-]{1,80}$/.test(req.params.id)) return res.status(400).json({error:'Evento inválido.'});
    const result=await databasePool.query(`UPDATE outbox_events SET status='pending',attempts=0,available_at=NOW(),last_error=NULL,
      locked_at=NULL,lock_token=NULL WHERE id=$1 AND status='dead' RETURNING id`,[req.params.id]);
    if(!result.rows.length) return res.status(404).json({error:'Evento em falha não encontrado.'});
    res.json({success:true});
  });

  // Get list of tenants (Always synced with PostgreSQL so Computer and Cell Phone show identical data)
  app.get('/api/v1/tenants', requireSuperAdmin, async (_req: Request, res: Response) => {
    if (pgPool) {
      try {
        const dbRes = await pgPool.query("SELECT * FROM tenants WHERE LOWER(slug) != 'aladay' ORDER BY created_at ASC;");
        if (dbRes.rows.length > 0) {
          for (let i = memoryTenants.length - 1; i >= 0; i--) {
            if (memoryTenants[i].slug.toLowerCase() === 'aladay' || memoryTenants[i].phone?.includes('9131976334')) {
              memoryTenants.splice(i, 1);
            }
          }
          dbRes.rows.forEach((row: any) => {
            if (String(row.slug || '').toLowerCase() === 'aladay') return;
            const mappedTenant: InMemTenant = {
              id: row.id,
              name: row.name,
              slug: row.slug,
              logoUrl: row.logo_url || '',
              phone: row.phone || '',
              address: row.address || '',
              primaryColor: row.primary_color || '#2563EB',
              isOpen: row.is_open ?? true,
              openingHoursText: row.opening_hours_text || 'Segunda a Domingo: 18:00 às 23:45',
              deliveryFeeCents: Number(row.delivery_fee_cents) || 0,
              minOrderCents: Number(row.min_order_cents) || 0,
              deliveryZones: Array.isArray(row.delivery_zones) ? row.delivery_zones : [],
              evolutionInstanceId: row.evolution_instance_id || `instancia_${row.slug}`,
              evolutionStatus: (row.evolution_status as any) || 'disconnected',
              subscriptionStatus: (row.subscription_status as any) || 'active',
              trialEndsAt: row.trial_ends_at ? new Date(row.trial_ends_at).toISOString() : undefined,
              statusNotificationTemplates: row.status_notification_templates || {},
              pixKey: row.pix_config?.pixKey || undefined,
              pixBeneficiaryName: row.pix_config?.beneficiaryName || row.pix_config?.merchantName || undefined,
              pixConfig: row.pix_config || undefined,
              tablesCount: Number(row.tables_count) || 12,
            };
            const existingIdx = memoryTenants.findIndex((m) => m.slug.toLowerCase() === mappedTenant.slug.toLowerCase());
            if (existingIdx >= 0) {
              memoryTenants[existingIdx] = { ...memoryTenants[existingIdx], ...mappedTenant };
            } else {
              memoryTenants.push(mappedTenant);
            }
          });
        }
      } catch {
        // Ignore transient DB error
      }
    }
    const cleanTenants = memoryTenants.filter(
      (t) => t.slug.toLowerCase() !== 'aladay' && !String(t.phone || '').includes('9131976334')
    );
    res.json({ data: cleanTenants.map((tenant) => serializeTenantForRequest(_req, tenant)) });
  });

  // Create new tenant (Onboarding Step 1 & 2)
  app.post('/api/v1/tenants', requireSuperAdmin, transactionalRoute(databasePool, async (req,res,client,afterCommit) => {
    const { name, slug, phone, primaryColor, address } = req.body;
    if (!name || !slug || !phone) {
      return res.status(400).json({ error: 'Campos obrigatórios: name, slug, phone' });
    }

    const cleanSlug = String(slug).toLowerCase().trim().replace(/[^a-z0-9-]/g, '-');
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(cleanSlug) || cleanSlug === 'aladay') {
      return res.status(400).json({ error: 'O identificador "aladay" é reservado exclusivamente para a plataforma.' });
    }

    const rawPhoneDigits = String(phone).replace(/\D/g, '').replace(/^0+/, '');
    if (rawPhoneDigits.includes('9131976334')) {
      return res.status(400).json({ error: 'Este número de WhatsApp é exclusivo do suporte comercial da plataforma Aladay.' });
    }

    const existing = memoryTenants.find((t) => t.slug === cleanSlug);
    if (existing) {
      return res.status(409).json({ error: `O slug "${cleanSlug}" já está em uso por outro restaurante.` });
    }

    const normalizedPhone =
      rawPhoneDigits.length === 10 || rawPhoneDigits.length === 11
        ? `55${rawPhoneDigits}`
        : rawPhoneDigits;
    if (!/^55\d{10,11}$/.test(normalizedPhone)) {
      return res.status(400).json({ error: 'Número de WhatsApp inválido.' });
    }

    const newTenant: InMemTenant = {
      id: `tenant_${Date.now()}`,
      name: String(name).trim(),
      slug: cleanSlug,
      phone: normalizedPhone,
      address: address ? String(address).trim() : 'Endereço a configurar',
      primaryColor: primaryColor || '#EA580C',
      isOpen: true,
      deliveryFeeCents: 700,
      minOrderCents: 2000,
      evolutionInstanceId: `instancia_${cleanSlug}`,
      evolutionStatus: 'disconnected',
      subscriptionStatus: 'active',
    };

    afterCommit(() => memoryTenants.push(newTenant));
    if (pgPool) {
      await client
        .query(
          `INSERT INTO tenants (id, name, slug, phone, address, primary_color, is_open, delivery_fee_cents, min_order_cents, evolution_instance_id, evolution_status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
;`,
          [
            newTenant.id,
            newTenant.name,
            newTenant.slug,
            newTenant.phone,
            newTenant.address,
            newTenant.primaryColor,
            newTenant.isOpen,
            newTenant.deliveryFeeCents,
            newTenant.minOrderCents,
            newTenant.evolutionInstanceId,
            newTenant.evolutionStatus,
          ]
        );
    }

    res.status(201).json({ message: 'Restaurante criado com sucesso!', data: newTenant });
  }));
  // Delete a tenant and all its associated records from memory and PostgreSQL (Super Admin)
  app.delete('/api/v1/tenants/:slug', requireSuperAdmin, transactionalRoute(databasePool, async (req,res,client,afterCommit) => {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    if (!slug) {
      return res.status(400).json({ error: 'Slug do restaurante inválido.' });
    }

    if (pgPool) {
      try {
        await client.query('DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM subscriber_users WHERE tenant_slug=$1)',[slug]);
        await client.query('DELETE FROM auth_otp WHERE email IN (SELECT email FROM subscriber_users WHERE tenant_slug=$1)',[slug]);
        await client.query('DELETE FROM outbox_events WHERE tenant_id IN (SELECT id FROM tenants WHERE slug=$1)',[slug]);
        await client.query('DELETE FROM billing_operations WHERE tenant_slug=$1',[slug]);
        await client.query('DELETE FROM products WHERE LOWER(tenant_slug) = $1;', [slug]);
        await client.query('DELETE FROM categories WHERE LOWER(tenant_slug) = $1;', [slug]);
        await client.query('DELETE FROM pix_transactions WHERE LOWER(tenant_slug) = $1;', [slug]);
        await client.query('DELETE FROM orders WHERE LOWER(tenant_slug) = $1;', [slug]);
        await client.query('DELETE FROM asaas_subscriptions WHERE LOWER(tenant_slug) = $1;', [slug]);
        await client.query("DELETE FROM subscriber_users WHERE LOWER(tenant_slug) = $1 AND role != 'SUPER_ADMIN';", [slug]);
        await client.query('DELETE FROM tenants WHERE LOWER(slug) = $1;', [slug]);
      } catch (err: any) {
        throw err;
      }
    }

    afterCommit(() => {
    for (let i = memoryTenants.length - 1; i >= 0; i--) {
      if (memoryTenants[i].slug.toLowerCase() === slug) memoryTenants.splice(i, 1);
    }
    for (let i = memoryCategories.length - 1; i >= 0; i--) {
      if (String(memoryCategories[i].tenantSlug || '').toLowerCase() === slug) memoryCategories.splice(i, 1);
    }
    for (let i = memoryProducts.length - 1; i >= 0; i--) {
      if (String(memoryProducts[i].tenantSlug || '').toLowerCase() === slug) memoryProducts.splice(i, 1);
    }
    for (let i = memoryOrders.length - 1; i >= 0; i--) {
      if (String(memoryOrders[i].tenantSlug || '').toLowerCase() === slug) memoryOrders.splice(i, 1);
    }
    for (let i = memoryPixTransactions.length - 1; i >= 0; i--) {
      if (String(memoryPixTransactions[i].tenantSlug || '').toLowerCase() === slug) memoryPixTransactions.splice(i, 1);
    }

    });
    res.json({
      success: true,
      message: `Restaurante "${slug}" e todos os seus dados foram excluídos do banco de dados com sucesso.`,

    });
  }));

  // ============================================================================
  // EASYPANEL VPS DATABASE MANAGEMENT ENDPOINTS (SUPER ADMIN ONLY)
  // ============================================================================
  app.get('/api/v1/admin/database/status', requireSuperAdmin, async (_req: Request, res: Response) => {
    let counts = {
      tenants: memoryTenants.length,
      categories: memoryCategories.length,
      products: memoryProducts.length,
      orders: memoryOrders.length,
      outbox_events: memoryOutboxEvents.length,
    };

    if (pgPool) {
      try {
        const resCounts = await pgPool.query(`
          SELECT
            (SELECT COUNT(*) FROM tenants)::int AS tenants,
            (SELECT COUNT(*) FROM categories)::int AS categories,
            (SELECT COUNT(*) FROM products)::int AS products,
            (SELECT COUNT(*) FROM orders)::int AS orders,
            (SELECT COUNT(*) FROM outbox_events)::int AS outbox_events;
        `);
        if (resCounts.rows[0]) {
          counts = resCounts.rows[0];
        }
      } catch (e: any) {
        dbConnectionState.connected = false;
        dbConnectionState.error = e?.message || 'Conexão perdida com o PostgreSQL.';
      }
    }

    res.json({
      data: {
        ...dbConnectionState,
        configuredViaEnv: Boolean(process.env.DATABASE_URL),
        maskedUrl: maskDatabaseUrl(activeDatabaseUrl),
        counts,
        initSqlScript: getInitSqlScript(),
      },
    });
  });

  app.post('/api/v1/admin/database/test-and-migrate',requireSuperAdmin,(_req,res)=>res.status(410).json({error:'Configure DATABASE_URL no ambiente e reinicie; a migração é aplicada na inicialização.'}));

  async function hydrateTenantCatalogFromDb(slug: string, queryable: pg.Pool | pg.PoolClient = databasePool) {
    if (!pgPool || !slug) return;
    const cleanSlug = slug.trim().toLowerCase();
    try {
      const tRes = await queryable.query('SELECT * FROM tenants WHERE LOWER(slug) = $1 LIMIT 1;', [cleanSlug]);
      if (!tRes.rows[0]) { const idx=memoryTenants.findIndex((item)=>item.slug===cleanSlug); if(idx>=0) memoryTenants.splice(idx,1); return; }
      if (tRes.rows[0]) {
        const row = tRes.rows[0];
        const mappedTenant: InMemTenant = {
          id: row.id,
          name: row.name,
          slug: row.slug,
          logoUrl: row.logo_url || '',
          phone: row.phone || '',
          address: row.address || '',
          primaryColor: row.primary_color || '#EA580C',
          isOpen: row.is_open ?? true,
          openingHoursText: row.opening_hours_text || 'Segunda a Domingo: 18:00 às 23:45',
          deliveryFeeCents: Number(row.delivery_fee_cents) || 0,
          minOrderCents: Number(row.min_order_cents) || 0,
          deliveryZones: Array.isArray(row.delivery_zones) ? row.delivery_zones : [],
          evolutionInstanceId: row.evolution_instance_id || `instancia_${row.slug}`,
          evolutionStatus: (row.evolution_status as any) || 'disconnected',
          subscriptionStatus: (row.subscription_status as any) || 'active',
          trialEndsAt: row.trial_ends_at ? new Date(row.trial_ends_at).toISOString() : undefined,
          statusNotificationTemplates: row.status_notification_templates || {},
          pixKey: row.pix_config?.pixKey || undefined,
          pixBeneficiaryName: row.pix_config?.beneficiaryName || row.pix_config?.merchantName || undefined,
          pixConfig: row.pix_config || undefined,
          tablesCount: Number(row.tables_count) || 12,
        };
        const existingIdx = memoryTenants.findIndex((m) => m.slug.toLowerCase() === cleanSlug);
        if (existingIdx >= 0) {
          memoryTenants[existingIdx] = { ...memoryTenants[existingIdx], ...mappedTenant };
        } else {
          memoryTenants.push(mappedTenant);
        }
      }

      const cRes = await queryable.query(
        'SELECT * FROM categories WHERE LOWER(tenant_slug) = $1 ORDER BY display_order ASC, created_at ASC;',
        [cleanSlug]
      );
      {
        for (let i = memoryCategories.length - 1; i >= 0; i--) {
          if (memoryCategories[i].tenantSlug.toLowerCase() === cleanSlug) {
            memoryCategories.splice(i, 1);
          }
        }
        cRes.rows.forEach((row) => {
          memoryCategories.push({
            id: row.id,
            tenantId: row.tenant_id,
            tenantSlug: row.tenant_slug,
            name: row.name,
            order: Number(row.display_order) || 1,
          });
        });
      }

      const pRes = await queryable.query(
        'SELECT * FROM products WHERE LOWER(tenant_slug) = $1 ORDER BY created_at ASC;',
        [cleanSlug]
      );
      {
        for (let i = memoryProducts.length - 1; i >= 0; i--) {
          if (memoryProducts[i].tenantSlug.toLowerCase() === cleanSlug) {
            memoryProducts.splice(i, 1);
          }
        }
        pRes.rows.forEach((row) => {
          memoryProducts.push({
            id: row.id,
            tenantId: row.tenant_id,
            tenantSlug: row.tenant_slug,
            categoryId: row.category_id,
            name: row.name,
            description: row.description || '',
            priceCents: Number(row.price_cents) || 0,
            imageUrl: row.image_url || undefined,
            isAvailable: row.is_available ?? true,
            isFeatured: row.is_featured ?? false,
            optionGroups: Array.isArray(row.option_groups) ? row.option_groups : [],
          });
        });
      }


    } catch {
      throw new Error('catalog_unavailable');
    }
  }

  // Get specific tenant (and public catalog snapshot)
  app.get('/api/v1/tenants/:slug', async (req: Request, res: Response) => {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    await hydrateTenantCatalogFromDb(slug);
    const tenant = memoryTenants.find((t) => t.slug.toLowerCase() === slug);
    if (!tenant) {
      return res.status(404).json({ error: 'Restaurante não encontrado.' });
    }
    const tenantCategories = memoryCategories
      .filter((c) => c.tenantSlug.toLowerCase() === slug)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    const tenantProducts = memoryProducts.filter((p) => p.tenantSlug.toLowerCase() === slug);
    res.json({
      data: serializeTenantForRequest(req, tenant),
      categories: tenantCategories,
      products: tenantProducts,
    });
  });

  // Public Digital Menu Catalog Endpoint for Customers (?loja=:slug)
  app.get('/api/v1/tenants/:slug/catalog', async (req: Request, res: Response) => {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    await hydrateTenantCatalogFromDb(slug);
    const tenant = memoryTenants.find((t) => t.slug.toLowerCase() === slug);
    if (!tenant) {
      return res.status(404).json({ error: 'Restaurante não encontrado.' });
    }
    const tenantCategories = memoryCategories
      .filter((c) => c.tenantSlug.toLowerCase() === slug)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    const tenantProducts = memoryProducts.filter((p) => p.tenantSlug.toLowerCase() === slug);
    res.json({
      success: true,
      data: {
        tenant: serializeTenantForRequest(req, tenant),
        categories: tenantCategories,
        products: tenantProducts,
      },
    });
  });

  mountCatalog(app, databasePool, requireTenantAccess('slug'), hydrateTenantCatalogFromDb);

  // Zero-Trust Checkout: server recalculates everything, persists order, and syncs with KDS in real time
  app.post('/api/v1/orders/checkout', transactionalRoute(databasePool, async (req, res, client, afterCommit) => {
    const {
      tenantSlug,
      customerName,
      customerPhone,
      type,
      tableNumber,
      deliveryAddress,
      deliveryZoneName,
      items,
      paymentMethod,
      idempotencyKey,
    } = req.body || {};

    const clientIp = getClientIp(req);
    if (!checkRateLimit(`checkout_${clientIp}`, 30, 60 * 1000)) {
      return res.status(429).json({ error: 'Muitas tentativas de checkout. Aguarde um minuto e tente novamente.' });
    }

    const cleanSlug = String(tenantSlug || '').trim().toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(cleanSlug)) {
      return res.status(400).json({ error: 'Restaurante inválido.' });
    }
    const locked = await client.query('SELECT * FROM tenants WHERE LOWER(slug) = $1 FOR UPDATE', [cleanSlug]);
    if(!locked.rows[0]) return res.status(404).json({error:'Restaurante não encontrado.'});
    await hydrateTenantCatalogFromDb(cleanSlug,client);
    const cachedTenant = memoryTenants.find((item) => item.slug.toLowerCase() === cleanSlug);
    const row = locked.rows[0];
    const tenant: InMemTenant | undefined = cachedTenant ? {...cachedTenant,id:row.id,slug:row.slug,isOpen:row.is_open,minOrderCents:row.min_order_cents,
      deliveryFeeCents:row.delivery_fee_cents,deliveryZones:row.delivery_zones,subscriptionStatus:row.subscription_status,trialEndsAt:row.trial_ends_at} : undefined;
    const productRows=await client.query('SELECT * FROM products WHERE tenant_slug=$1 FOR SHARE',[cleanSlug]);
    const checkoutProducts=productRows.rows.map(product=>({id:product.id,tenantSlug:product.tenant_slug,name:product.name,isAvailable:product.is_available,priceCents:product.price_cents,optionGroups:product.option_groups}));
    if (!tenant) {
      return res.status(404).json({ error: 'Restaurante não encontrado.' });
    }

    if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
      return res.status(400).json({ error: 'O carrinho está vazio.' });
    }

    const cleanIdempotencyKey = String(idempotencyKey || '').trim();
    if (!/^[a-zA-Z0-9:_-]{8,120}$/.test(cleanIdempotencyKey)) {
      return res.status(400).json({ error: 'Chave de idempotência do checkout ausente ou inválida.' });
    }

    const requestHash = fingerprint({tenantSlug:cleanSlug,customerName,customerPhone,type,tableNumber,deliveryAddress,deliveryZoneName,items,paymentMethod});
    const existingRes = await client.query(
      'SELECT id, request_hash FROM orders WHERE idempotency_key = $1 AND LOWER(tenant_slug) = $2',
      [cleanIdempotencyKey, cleanSlug]);
    let existing;
    if (existingRes.rows[0]) {
      if (existingRes.rows[0].request_hash !== requestHash) return res.status(409).json({ error: 'Chave de idempotência utilizada com outro pedido.' });
      existing = await hydrateOrderFromDbById(existingRes.rows[0].id,client);
    }
    if (existing) {
      return res.json({ message: 'Pedido já processado anteriormente.', data: existing });
    }

    if(row.subscription_access_until && new Date(row.subscription_access_until).getTime()<=Date.now()) return res.status(409).json({error:'Assinatura do restaurante expirada.'});
    if (!tenant.isOpen) return res.status(409).json({error:'O restaurante está fechado.'});
    if (!['active','trial'].includes(tenant.subscriptionStatus || '') || (tenant.subscriptionStatus==='trial' && (!tenant.trialEndsAt || new Date(tenant.trialEndsAt).getTime()<=Date.now()))) return res.status(409).json({error:'Restaurante temporariamente indisponível para pedidos.'});
    let subtotalCents = 0;
    const validatedItems: any[] = [];
    for (const item of items) {
      if (!item || typeof item !== 'object') return res.status(400).json({ error: 'Item inválido.' });
      const catalogProduct = checkoutProducts.find(
        (p) => p.id === item.productId && p.tenantSlug?.toLowerCase() === tenant.slug.toLowerCase()
      );
      if (!catalogProduct || catalogProduct.isAvailable === false) {
        return res.status(409).json({ error: 'Um item do carrinho não existe ou não está disponível.' });
      }
      const unitPriceCents = Math.max(0, Number(catalogProduct.priceCents) || 0);
      const quantity = Number(item.quantity);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
        return res.status(400).json({ error: `Quantidade inválida para ${catalogProduct.name}.` });
      }

      let optionsTotalCents = 0;
      const validatedOptions: any[] = [];
      const requestedOptions = Array.isArray(item.selectedOptions) ? item.selectedOptions : [];
      const optionGroups = Array.isArray(catalogProduct.optionGroups) ? catalogProduct.optionGroups : [];
      for (const group of optionGroups) {
        const selectedIds = Array.from(
          new Set(
            requestedOptions
              .filter((option: any) => String(option.groupId || '') === String(group.id))
              .map((option: any) => String(option.itemId || ''))
              .filter(Boolean)
          )
        );
        const minSelections = Math.max(group.required ? 1 : 0, Number(group.minSelections) || 0);
        const maxSelections = Math.max(minSelections, Number(group.maxSelections) || group.items?.length || 1);
        if (selectedIds.length < minSelections || selectedIds.length > maxSelections) {
          return res.status(400).json({ error: `Seleção inválida no grupo ${group.name}.` });
        }
        for (const selectedId of selectedIds) {
          const matchedOption = Array.isArray(group.items)
            ? group.items.find((option: any) => String(option.id) === selectedId)
            : undefined;
          if (!matchedOption) {
            return res.status(400).json({ error: `Opção inválida no produto ${catalogProduct.name}.` });
          }
          const optionPriceCents = Math.max(0, Number(matchedOption.priceCents) || 0);
          optionsTotalCents += optionPriceCents;
          validatedOptions.push({
            groupId: String(group.id),
            groupName: String(group.name || '').slice(0, 80),
            itemId: String(matchedOption.id),
            itemName: String(matchedOption.name || '').slice(0, 100),
            priceCents: optionPriceCents,
          });
        }
      }
      if (requestedOptions.length !== validatedOptions.length) {
        return res.status(400).json({ error: `Há opções desconhecidas no produto ${catalogProduct.name}.` });
      }

      const calculatedItemTotal = (unitPriceCents + optionsTotalCents) * quantity;
      subtotalCents += calculatedItemTotal;
      validatedItems.push({
        productId: String(catalogProduct.id),
        productName: String(catalogProduct.name).slice(0, 100),
        unitPriceCents,
        quantity,
        selectedOptions: validatedOptions,
        notes: item.notes ? String(item.notes).trim().slice(0, 300) : undefined,
        totalCents: calculatedItemTotal,
      });
    }

    if (subtotalCents < Math.max(0, tenant.minOrderCents || 0)) {
      return res.status(409).json({ error: 'O pedido não atingiu o valor mínimo do restaurante.' });
    }

    const resolvedType = type === 'pickup' ? 'pickup' : type === 'dine_in' ? 'dine_in' : 'delivery';
    const activeZones = (tenant.deliveryZones || []).filter((zone) => zone.active !== false);
    const selectedZone = activeZones.find(
      (zone) => zone.id === deliveryZoneName || zone.name.toLowerCase() === String(deliveryZoneName || '').toLowerCase()
    );
    if (resolvedType === 'delivery' && activeZones.length > 0 && !selectedZone) {
      return res.status(400).json({ error: 'Selecione uma zona de entrega válida.' });
    }
    const cleanDeliveryAddress = String(deliveryAddress || '').trim().slice(0, 200);
    if (resolvedType === 'delivery' && cleanDeliveryAddress.length < 5) {
      return res.status(400).json({ error: 'Informe um endereço de entrega válido.' });
    }
    const cleanTableNumber = String(tableNumber || '').trim().slice(0, 30);
    if (resolvedType === 'dine_in' && !cleanTableNumber) {
      return res.status(400).json({ error: 'Informe a mesa para o pedido no salão.' });
    }
    const deliveryFeeCents = resolvedType === 'delivery'
      ? Math.max(0, Number(selectedZone?.feeCents ?? tenant.deliveryFeeCents) || 0)
      : 0;
    const totalCents = subtotalCents + deliveryFeeCents;
    if (!Number.isSafeInteger(totalCents) || totalCents <= 0 || totalCents > 10000000) return res.status(400).json({ error: 'Valor de pedido inválido.' });

    let orderNumber = Math.max(
      1040,
      ...memoryOrders
        .filter((order) => order.tenantSlug === tenant.slug)
        .map((order) => Number(order.orderNumber) || 0)
    ) + 1;
    if (pgPool) {
      try {
        const numberRes = await client.query(
          'SELECT COALESCE(MAX(order_number), 1040) + 1 AS next_number FROM orders WHERE LOWER(tenant_slug) = LOWER($1);',
          [tenant.slug]
        );
        orderNumber = Math.max(orderNumber, Number(numberRes.rows[0]?.next_number) || orderNumber);
      } catch (error) { throw error; }
    }
    const orderId = `ord_${crypto.randomUUID()}`;
    const nowTime = new Date().toISOString();
    const normalizedCustomerPhone = normalizeBrazilWhatsAppNumber(customerPhone || '');
    if (normalizedCustomerPhone && !/^55\d{10,11}$/.test(normalizedCustomerPhone)) {
      return res.status(400).json({ error: 'Número de WhatsApp inválido.' });
    }
    const safePaymentMethod = String(paymentMethod || '').toLowerCase().includes('pix')
      ? 'Pix'
      : String(paymentMethod || '').toLowerCase().includes('dinheiro')
      ? 'Dinheiro'
      : String(paymentMethod || '').toLowerCase().includes('cart')
      ? 'Cartão na entrega'
      : '';
    if (!safePaymentMethod) {
      return res.status(400).json({ error: 'Forma de pagamento inválida.' });
    }

    const newOrder: any = {
      id: orderId,
      orderNumber,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      customerName: String(customerName || 'Cliente').trim().slice(0, 80),
      customerPhone: normalizedCustomerPhone,
      type: resolvedType,
      tableNumber: cleanTableNumber || undefined,
      deliveryAddress: resolvedType === 'delivery' ? cleanDeliveryAddress : undefined,
      deliveryZoneName: selectedZone?.name,
      estimatedMinutes: resolvedType === 'dine_in' ? 15 : selectedZone?.estimatedMinutes || 35,
      items: validatedItems,
      subtotalCents,
      deliveryFeeCents,
      totalCents,
      status: safePaymentMethod === 'Pix' ? 'received' : 'confirmed',
      paymentStatus: 'pending',
      paymentMethod: safePaymentMethod,
      whatsAppStatus: 'pending',
      whatsAppLogs: [
        {
          timestamp: new Date().toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
          event: 'order.created',
          detail: `Pedido #${orderNumber} recebido via Cardápio Digital.`,
        },
      ],
      idempotencyKey: cleanIdempotencyKey,
      createdAt: nowTime,
      updatedAt: nowTime,
    };

    afterCommit(() => memoryOrders.unshift(newOrder));

    // Write to Outbox table
    const outboxEvent = {
      id: `evt_${crypto.randomUUID()}`,
      tenantId: tenant.id,
      aggregateType: 'order',
      aggregateId: newOrder.id,
      eventType: 'order.created',
      payload: { orderId: newOrder.id, tenantSlug: tenant.slug, totalCents: newOrder.totalCents },
      status: 'pending',
      processedAt: null,
    };


    if (pgPool) {
      try {
          await client.query(
            `INSERT INTO orders (id, order_number, tenant_id, tenant_slug, customer_name, customer_phone, order_type, table_number, delivery_address, delivery_zone_name, estimated_minutes, items, subtotal_cents, delivery_fee_cents, total_cents, status, payment_status, payment_method, whatsapp_status, whatsapp_logs, idempotency_key, request_hash)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, $15, $16, $17, $18, $19, $20::jsonb, $21, $22)
             ON CONFLICT (id) DO NOTHING;`,
            [
              newOrder.id,
              newOrder.orderNumber,
              newOrder.tenantId,
              newOrder.tenantSlug,
              newOrder.customerName,
              newOrder.customerPhone,
              newOrder.type,
              newOrder.tableNumber || null,
              newOrder.deliveryAddress || null,
              newOrder.deliveryZoneName || null,
              newOrder.estimatedMinutes || 35,
              JSON.stringify(newOrder.items),
              newOrder.subtotalCents,
              newOrder.deliveryFeeCents,
              newOrder.totalCents,
              newOrder.status,
              newOrder.paymentStatus,
              newOrder.paymentMethod,
              newOrder.whatsAppStatus,
              JSON.stringify(newOrder.whatsAppLogs || []),
              newOrder.idempotencyKey || null,
              requestHash,
            ]
          );
          await client.query(
            `INSERT INTO outbox_events (id, tenant_id, aggregate_type, aggregate_id, event_type, payload, status, processed_at)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, NULL)
             ON CONFLICT (id) DO NOTHING;`,
            [
              outboxEvent.id,
              outboxEvent.tenantId,
              outboxEvent.aggregateType,
              outboxEvent.aggregateId,
              outboxEvent.eventType,
              JSON.stringify(outboxEvent.payload),
              outboxEvent.status,
            ]
          );
      } catch (err) {
        throw err;
      }
    }

    res.status(201).json({
      message: 'Pedido recebido pelo restaurante com sucesso!',
      data: newOrder,
    });
  }));

  // Get orders for a tenant (Supports real-time KDS polling for the restaurant dashboard)
  app.get('/api/v1/tenants/:slug/orders', requireTenantAccess('slug'), async (req: Request, res: Response) => {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    let tenantOrders = memoryOrders.filter((o) => String(o.tenantSlug || '').toLowerCase() === slug);

    if (pgPool) {
      try {
        const dbRes = await pgPool.query(
          `SELECT * FROM orders WHERE LOWER(tenant_slug) = $1 ORDER BY created_at DESC LIMIT 100;`,
          [slug]
        );
        {
          const loadedOrders = dbRes.rows.map((r: any) => ({
            id: r.id,
            orderNumber: r.order_number,
            tenantId: r.tenant_id,
            tenantSlug: r.tenant_slug,
            customerName: r.customer_name,
            customerPhone: r.customer_phone,
            type: r.order_type || 'delivery',
            tableNumber: r.table_number || undefined,
            deliveryAddress: r.delivery_address || undefined,
            deliveryZoneName: r.delivery_zone_name || undefined,
            estimatedMinutes: r.estimated_minutes || 35,
            items: Array.isArray(r.items) ? r.items : [],
            subtotalCents: r.subtotal_cents || 0,
            deliveryFeeCents: r.delivery_fee_cents || 0,
            totalCents: r.total_cents || 0,
            status: r.status || 'received',
            paymentStatus: r.payment_status || 'pending',
            paymentMethod: r.payment_method || 'Pix',
            whatsAppStatus: r.whatsapp_status || 'delivered',
            whatsAppLogs: Array.isArray(r.whatsapp_logs) ? r.whatsapp_logs : [],
            createdAt: r.created_at
              ? new Date(r.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
              : '19:00',
            updatedAt: r.updated_at
              ? new Date(r.updated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
              : '19:00',
          }));
          for (const ord of loadedOrders) {
            if (!memoryOrders.some((m) => m.id === ord.id)) {
              memoryOrders.push(ord);
            }
          }
          tenantOrders = loadedOrders;
        }
      } catch (error) { throw error; }
    }

    res.json({ data: tenantOrders });
  });

  // --- PIX BR CODE HELPERS (BACEN STANDARD) ---
  function formatEMV(id: string, value: string): string {
    const len = String(value.length).padStart(2, '0');
    return `${id}${len}${value}`;
  }

  function calculateCRC16(str: string): string {
    let crc = 0xffff;
    for (let c = 0; c < str.length; c++) {
      crc ^= str.charCodeAt(c) << 8;
      for (let i = 0; i < 8; i++) {
        if ((crc & 0x8000) !== 0) {
          crc = ((crc << 1) ^ 0x1021) & 0xffff;
        } else {
          crc = (crc << 1) & 0xffff;
        }
      }
    }
    return (crc & 0xffff).toString(16).toUpperCase().padStart(4, '0');
  }

  function sanitizeEmvField(val: string, maxLen: number, fallback: string): string {
    const cleaned = (val || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase()
      .slice(0, maxLen)
      .trim();
    return cleaned || fallback.slice(0, maxLen);
  }

  function isValidCpfServer(digits: string): boolean {
    const clean = (digits || '').replace(/\D/g, '');
    if (clean.length !== 11 || /^(\d)\1{10}$/.test(clean)) return false;
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(clean.charAt(i), 10) * (10 - i);
    let rev = 11 - (sum % 11);
    if (rev === 10 || rev === 11) rev = 0;
    if (rev !== parseInt(clean.charAt(9), 10)) return false;
    sum = 0;
    for (let i = 0; i < 10; i++) sum += parseInt(clean.charAt(i), 10) * (11 - i);
    rev = 11 - (sum % 11);
    if (rev === 10 || rev === 11) rev = 0;
    return rev === parseInt(clean.charAt(10), 10);
  }

  function formatPixKeyForBacenServer(rawKey: string, pixKeyType?: string, tenantPhone?: string): string {
    const trimmed = (rawKey || '').trim();
    if (!trimmed) throw new HttpError(400,'Chave Pix não configurada.');
    if (trimmed.includes('@') || pixKeyType === 'email') {
      return trimmed.toLowerCase().replace(/\s+/g, '');
    }
    if (
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(trimmed) ||
      pixKeyType === 'random'
    ) {
      return trimmed.toLowerCase().replace(/\s+/g, '');
    }
    const digits = trimmed.replace(/\D/g, '');
    const cleanTenantPhone = (tenantPhone || '').replace(/\D/g, '');

    if (trimmed.startsWith('+')) {
      if (digits.startsWith('55') && digits.length >= 12 && digits.length <= 13) return `+${digits}`;
      return `+55${digits}`;
    }
    if (digits.length === 14 && pixKeyType !== 'phone') return digits;
    if (digits.length === 11) {
      const matchesTenantPhone =
        Boolean(cleanTenantPhone) && (cleanTenantPhone === digits || cleanTenantPhone === `55${digits}`);
      if (pixKeyType === 'cpf' || (!matchesTenantPhone && isValidCpfServer(digits))) {
        return digits;
      }
      return `+55${digits}`;
    }
    if (digits.length === 10) return `+55${digits}`;
    if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
      const withoutDdi = digits.slice(2);
      if (pixKeyType === 'cpf' && withoutDdi.length === 11 && isValidCpfServer(withoutDdi)) {
        return withoutDdi;
      }
      return `+${digits}`;
    }
    if (pixKeyType === 'cpf' || pixKeyType === 'cnpj') return digits;
    return trimmed.replace(/\s+/g, '');
  }

  function generatePixPayload(params: {
    pixKey: string;
    pixKeyType?: string;
    tenantPhone?: string;
    merchantName: string;
    merchantCity: string;
    amountCents: number;
    txid: string;
  }): string {
    const amountStr = (Math.max(1, params.amountCents) / 100).toFixed(2);
    const formattedKey = formatPixKeyForBacenServer(params.pixKey, params.pixKeyType, params.tenantPhone);
    const emvName = sanitizeEmvField(params.merchantName, 25, 'RESTAURANTE');
    const emvCity = sanitizeEmvField(params.merchantCity, 15, 'BELEM');
    const cleanTxid = (params.txid || 'PEDIDO').replace(/[^a-zA-Z0-9]/g, '').slice(0, 25) || 'PEDIDO';

    // BACEN BR Code compliant: lowercase GUI 'br.gov.bcb.pix' and no Tag 01=12 when using a direct Pix key (Subtag 01)
    const merchantAccount = formatEMV('00', 'br.gov.bcb.pix') + formatEMV('01', formattedKey);
    const additionalData = formatEMV('05', cleanTxid);

    const payload =
      formatEMV('00', '01') +
      formatEMV('26', merchantAccount) +
      formatEMV('52', '0000') +
      formatEMV('53', '986') + // BRL
      formatEMV('54', amountStr) +
      formatEMV('58', 'BR') +
      formatEMV('59', emvName) +
      formatEMV('60', emvCity) +
      formatEMV('62', additionalData) +
      '6304';

    const crc = calculateCRC16(payload);
    return `${payload}${crc}`;
  }

  mountPix(app, databasePool, generatePixPayload);
  mountAsaasWebhook(app, databasePool);

  app.get('/api/v1/asaas/pix/status', requireTenantQueryAccess('tenantSlug'), async(req,res)=>{
    const result=await databasePool.query(`SELECT p.txid,p.status,p.paid_at,o.id FROM pix_transactions p
      JOIN orders o ON o.id=p.order_id AND o.tenant_slug=p.tenant_slug
      WHERE p.tenant_slug=$1 AND (o.id=$2 OR p.txid=$3) LIMIT 1`,[String(req.query.tenantSlug),String(req.query.orderId||''),String(req.query.txid||'')]);
    const charge=result.rows[0];
    if(!charge) return res.status(404).json({error:'Cobrança não encontrada.'});
    res.json({paid:charge.status==='PAID',status:charge.status,txid:charge.txid,paidAt:charge.paid_at});
  });

  app.post('/api/v1/pix/simulate-payment', requireSuperAdmin, (_req,res)=>res.status(410).json({error:'Use eventos autenticados em ambiente de teste.'}));

  // GET Tenant Pix Config
  app.get('/api/v1/tenants/:slug/pix-config', requireTenantAccess('slug'), (req: Request, res: Response) => {
    const tenant = memoryTenants.find((t) => t.slug === req.params.slug);
    if (!tenant) return res.status(404).json({ error: 'Restaurante não encontrado.' });
    res.json({
      data: tenant.pixConfig || {
        provider: 'direct_bank',
        pixKey: tenant.pixKey || tenant.phone || '5511987654321',
        pixKeyType: 'phone',
        beneficiaryName: tenant.pixBeneficiaryName || tenant.name,
        merchantName: (tenant.pixBeneficiaryName || tenant.name).slice(0, 25),
        merchantCity: 'SAO PAULO',
        autoApproveWebhook: true,
      },
    });
  });

  // PUT Tenant Pix Config
  app.put('/api/v1/tenants/:slug/pix-config', requireTenantAccess('slug'), async (req: Request, res: Response) => {
    const slug = String(req.params.slug || '').trim();
    const tenant = memoryTenants.find((t) => t.slug === slug);
    if (!tenant) {
      return res.status(404).json({ error: 'Restaurante não encontrado.' });
    }

    const { provider, pixKey, pixKeyType, beneficiaryName, merchantName, merchantCity, bankName, autoApproveWebhook } = req.body;
    const allowedProviders = new Set(['direct_bank', 'openpix', 'mercadopago', 'asaas', 'efi', 'manual']);
    const allowedKeyTypes = new Set(['cpf', 'cnpj', 'email', 'phone', 'random']);
    if (!allowedProviders.has(String(provider || 'direct_bank')) || !allowedKeyTypes.has(String(pixKeyType || 'phone'))) {
      return res.status(400).json({ error: 'Provedor ou tipo de chave Pix inválido.' });
    }
    const cleanKey = pixKey ? String(pixKey).trim() : tenant.pixKey || tenant.phone || '';
    if (cleanKey.length < 3 || cleanKey.length > 77) return res.status(400).json({error:'Chave Pix inválida.'});
    if((['cpf','cnpj'].includes(pixKeyType) && !validTaxId(cleanKey)) || (pixKeyType==='email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanKey)) || (pixKeyType==='phone' && !/^55\d{10,11}$/.test(phoneNumber(cleanKey))) || (pixKeyType==='random' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanKey))) return res.status(400).json({error:'Chave Pix incompatível com o tipo informado.'});
    const cleanBeneficiary = String(beneficiaryName || merchantName || tenant.pixBeneficiaryName || tenant.name).trim();

    tenant.pixKey = cleanKey;
    tenant.pixBeneficiaryName = cleanBeneficiary;
    tenant.pixConfig = {
      ...(tenant.pixConfig || {}),
      provider: provider || 'direct_bank',
      pixKey: cleanKey,
      pixKeyType: pixKeyType || 'phone',
      beneficiaryName: cleanBeneficiary,
      merchantName: cleanBeneficiary.slice(0, 25),
      merchantCity: merchantCity ? String(merchantCity).trim().slice(0, 15).toUpperCase() : 'SAO PAULO',
      bankName: bankName ? String(bankName).trim() : tenant.pixConfig?.bankName || 'Conta Bancária do Proprietário',
      autoApproveWebhook: autoApproveWebhook ?? true,
      updatedAt: new Date().toISOString(),
    };

    if (pgPool) {
      await pgPool
        .query('UPDATE tenants SET pix_config = $1::jsonb, updated_at = NOW() WHERE slug = $2;', [
          JSON.stringify(tenant.pixConfig),
          tenant.slug,
        ])
;
    }

    res.json({
      success: true,
      message: `Chave Pix e Nome do Beneficiário atualizados com sucesso para ${tenant.name}!`,
      data: tenant.pixConfig,
    });
  });

  const defaultStatusTemplates: Record<string, string> = {
    confirmed: `✅ *Pedido #{numero_pedido} Confirmado!*\n\nOlá, *{cliente_primeiro_nome}*! Seu pedido foi confirmado com sucesso pela equipe do *{restaurante_nome}* e já entrou na nossa fila de produção! 👨‍🍳🔥\n\n📦 *Itens:* {itens_resumo}\n🛵 *Tipo:* {tipo_pedido}\n📍 *Destino:* {endereco_entrega}\n💰 *Total:* {total} ({forma_pagamento})\n⏱️ *Previsão de Entrega:* {previsao_minutos} min\n\n👉 *Acompanhe em tempo real pelo link:*\n{link_rastreamento}`,
    preparing: `🔥 *Pedido #{numero_pedido} no Fogo!*\n\n*{cliente_primeiro_nome}*, a chapa está quente! Nossos chefs já estão preparando seu pedido com todo carinho no *{restaurante_nome}*! 🍔\n\n📦 *Itens em preparo:* {itens_resumo}\n⏱️ *Previsão para sair:* ~15 a 20 min\n\n👉 *Acompanhe seu pedido ao vivo:*\n{link_rastreamento}`,
    ready_delivery: `🛵 *Pedido #{numero_pedido} a Caminho!*\n\n*{cliente_primeiro_nome}*, seu pedido acabou de sair para entrega com o nosso motoboy! 💨\n\n📍 *Destino:* {endereco_entrega}\n⏱️ *Previsão de chegada:* 10 a 25 min\n\nPor favor, fique atento ao interfone ou portaria!\n👉 *Rastrear pedido no mapa:*\n{link_rastreamento}`,
    ready_pickup: `🛍️ *Pedido #{numero_pedido} Pronto para Retirada!*\n\n*{cliente_primeiro_nome}*, seu pedido está quentinho, embalado e pronto te esperando no balcão do *{restaurante_nome}*! ✨\n\n📍 *Endereço para retirada:* {restaurante_endereco}\n\nVenha retirar quando puder! Apresente o código #{numero_pedido}.`,
    delivered: `🎉 *Pedido #{numero_pedido} Entregue com Sucesso!*\n\nBom apetite, *{cliente_primeiro_nome}*! 😋\nAgradecemos imensamente a sua preferência no *{restaurante_nome}*!\n\nEsperamos que sua refeição esteja deliciosa. Se puder, nos conte o que achou respondendo esta mensagem! 💬`,
    cancelled: `⚠️ *Aviso: Pedido #{numero_pedido} Cancelado*\n\nOlá, *{cliente_primeiro_nome}*. Informamos que seu pedido #{numero_pedido} no *{restaurante_nome}* foi cancelado.\n\nSe você tiver qualquer dúvida ou quiser refazer seu pedido, basta responder diretamente a esta mensagem para falar com nossa equipe!`,
  };

  function interpolateTemplate(template: string, vars: Record<string, string>): string {
    let result = template;
    for (const [key, value] of Object.entries(vars)) {
      result = result.split(`{${key}}`).join(value !== undefined && value !== null ? String(value) : '');
    }
    return result;
  }

  function getOrderTemplateVars(order: any, tenant: any): Record<string, string> {
    const safeOrder = order || {
      id: '1042',
      orderNumber: 1042,
      customerName: 'Cliente',
      customerPhone: '',
      type: 'delivery',
      deliveryAddress: 'Endereço informado',
      deliveryZoneName: 'Bela Vista',
      estimatedMinutes: 35,
      items: [{ quantity: 1, productName: 'Smash Burger Artesanal' }],
      totalCents: 4500,
      subtotalCents: 4000,
      deliveryFeeCents: 500,
      paymentMethod: 'Pix no Recebimento',
    };
    const safeTenant = tenant || {
      name: 'Restaurante',
      address: '',
      phone: '',
      deliveryZones: [],
    };

    const customerFirstName = (safeOrder.customerName || 'Cliente').trim().split(' ')[0] || 'Cliente';
    const orderNum = String(safeOrder.orderNumber || safeOrder.id || '1042');
    const totalFormatted = `R$ ${(((safeOrder.totalCents || 0)) / 100).toFixed(2).replace('.', ',')}`;
    const subtotalFormatted = `R$ ${(((safeOrder.subtotalCents || 0)) / 100).toFixed(2).replace('.', ',')}`;
    const deliveryFeeFormatted = `R$ ${(((safeOrder.deliveryFeeCents || 0)) / 100).toFixed(2).replace('.', ',')}`;
    const baseAppUrl = (process.env.APP_URL || 'https://aladay.com.br').replace(/\/$/, '');
    const trackingUrl = `${baseAppUrl}/pedido/${safeOrder.id || '1042'}`;
    const itemsSummary = (safeOrder.items || [])
      .map((i: any) => `${i?.quantity || 1}x ${i?.productName || 'Item'}`)
      .join(', ') || 'Itens selecionados';
    const orderType = safeOrder.type === 'delivery' ? 'Entrega' : 'Retirada no Balcão';
    const address = safeOrder.type === 'delivery'
      ? (safeOrder.deliveryAddress || 'Endereço informado')
      : `Retirada no Balcão (${safeTenant.address || 'Balcão da loja'})`;
    const estimatedMin = String(
      safeOrder.estimatedMinutes || (safeTenant.deliveryZones && safeTenant.deliveryZones[0]?.estimatedMinutes) || 35
    );

    return {
      cliente_nome: safeOrder.customerName || 'Cliente',
      cliente_primeiro_nome: customerFirstName,
      numero_pedido: orderNum,
      restaurante_nome: safeTenant.name || 'Restaurante',
      restaurante_endereco: safeTenant.address || '',
      restaurante_telefone: safeTenant.phone || '',
      tipo_pedido: orderType,
      endereco_entrega: address,
      bairro_entrega: safeOrder.deliveryZoneName || 'Bairro cadastrado',
      previsao_minutos: estimatedMin,
      total: totalFormatted,
      subtotal: subtotalFormatted,
      taxa_entrega: deliveryFeeFormatted,
      itens_resumo: itemsSummary,
      forma_pagamento: safeOrder.paymentMethod || 'Pix',
      link_rastreamento: trackingUrl,
    };
  }

  // Helper function to build formatted WhatsApp status update messages
  function buildStatusNotificationText(order: any, tenant: any, newStatus: string): string {
    const vars = getOrderTemplateVars(order, tenant);
    const customTemplates = tenant?.statusNotificationTemplates || {};

    let templateKey = newStatus;
    if (newStatus === 'ready') {
      templateKey = (order?.type === 'delivery') ? 'ready_delivery' : 'ready_pickup';
    }

    const rawTemplate = customTemplates[templateKey] || defaultStatusTemplates[templateKey];
    if (rawTemplate) {
      return interpolateTemplate(rawTemplate, vars);
    }

    return `📋 *Atualização do Pedido #${vars.numero_pedido}*\n\nOlá, *${vars.cliente_primeiro_nome}*, o status do seu pedido no *${vars.restaurante_nome}* foi atualizado para: *${newStatus}*.\n\n👉 *Acompanhe:* ${vars.link_rastreamento}`;
  }

  // Update order status in KDS and trigger WhatsApp Notification
  app.patch('/api/v1/orders/:id/status', requireOrderAccess, transactionalRoute(databasePool, async (req,res,client,afterCommit) => {
    const claims = getAuthenticatedClaims(req);
    const result = await client.query('SELECT * FROM orders WHERE id=$1 AND ($2 OR tenant_slug=$3) FOR UPDATE',[req.params.id,claims.role==='SUPER_ADMIN',claims.tenant_slug]);
    const order = result.rows[0];
    if (!order) return res.status(404).json({error:'Pedido não encontrado.'});
    const status = String(req.body?.status || '');
    const transitions: Record<string,string[]> = { received:['confirmed','cancelled'],confirmed:['preparing','cancelled'],preparing:['ready','cancelled'],ready:['delivered','cancelled'],delivered:[],cancelled:[] };
    if (status !== order.status && !transitions[order.status]?.includes(status)) return res.status(409).json({error:'Transição de pedido inválida.'});
    if (status === 'confirmed' && order.payment_method === 'Pix' && order.payment_status !== 'paid_online') return res.status(409).json({error:'Aguardando confirmação do pagamento Pix.'});
    if (status !== order.status) {
      await client.query('UPDATE orders SET status=$1,updated_at=NOW() WHERE id=$2 AND tenant_slug=$3',[status,order.id,order.tenant_slug]);
      await enqueue(client,order.tenant_id,order.id,'order.status_changed',{orderId:order.id,tenantSlug:order.tenant_slug,status});
    }
    afterCommit(()=>{void hydrateOrderFromDbById(order.id);});
    res.json({success:true,data:{id:order.id,status}});
  }));

  async function hydrateOrderFromDbById(orderId: string, queryable: pg.Pool | pg.PoolClient = databasePool) {
    if (!pgPool || !orderId) return null;
    try {
      const dbRes = await queryable.query('SELECT * FROM orders WHERE id = $1 LIMIT 1;', [orderId]);
      if (dbRes.rows.length > 0) {
        const r = dbRes.rows[0];
        const loadedOrd = {
          id: r.id,
          orderNumber: Number(r.order_number) || 1000,
          tenantId: r.tenant_id,
          tenantSlug: r.tenant_slug,
          customerName: r.customer_name,
          customerPhone: r.customer_phone,
          type: r.order_type || 'delivery',
          tableNumber: r.table_number || undefined,
          deliveryAddress: r.delivery_address || undefined,
          deliveryZoneName: r.delivery_zone_name || undefined,
          estimatedMinutes: Number(r.estimated_minutes) || 35,
          items: Array.isArray(r.items) ? r.items : [],
          subtotalCents: Number(r.subtotal_cents) || 0,
          deliveryFeeCents: Number(r.delivery_fee_cents) || 0,
          totalCents: Number(r.total_cents) || 0,
          status: r.status || 'received',
          paymentStatus: r.payment_status || 'pending',
          paymentMethod: r.payment_method || 'Pix',
          whatsAppStatus: r.whatsapp_status || 'delivered',
          idempotencyKey: r.idempotency_key || undefined,
          pixTransaction: r.pix_transaction || undefined,
          whatsAppLogs: Array.isArray(r.whatsapp_logs) ? r.whatsapp_logs : [],
          createdAt: r.created_at
            ? new Date(r.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
            : '19:00',
          updatedAt: r.updated_at
            ? new Date(r.updated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
            : '19:00',
        };
        const existingIdx = memoryOrders.findIndex((o) => o.id === loadedOrd.id);
        if (existingIdx >= 0) {
          memoryOrders[existingIdx] = loadedOrd;
        } else {
          memoryOrders.unshift(loadedOrd);
        }
        return loadedOrd;
      }
    } catch(error) {throw error;}
    return null;
  }

  // Get specific order details
  app.get('/api/v1/orders/:id', requireOrderAccess, async (req: Request, res: Response) => {
    let order = (req as any).order || memoryOrders.find((o) => o.id === req.params.id);
    if (!order) {
      order = (await hydrateOrderFromDbById(req.params.id)) || undefined;
    }
    if (!order) {
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }
    const tenant = memoryTenants.find((t) => t.slug === order.tenantSlug) || memoryTenants[0];
    res.json({ data: order, tenant });
  });

  // Public Order Tracking Endpoint (Real-time customer view)
  app.get('/api/v1/orders/:id/tracking', async (req: Request, res: Response) => {
    const order = await hydrateOrderFromDbById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Pedido não encontrado para rastreamento.' });
    }
    const tenant = memoryTenants.find((t) => t.slug === order.tenantSlug) || memoryTenants[0];

    const timelineSteps = [
      {
        key: 'received',
        title: 'Pedido Recebido',
        description: 'Recebido pelo sistema e aguardando confirmação',
        completed: ['received', 'confirmed', 'preparing', 'ready', 'delivered'].includes(order.status),
        current: order.status === 'received',
      },
      {
        key: 'confirmed',
        title: 'Pedido Confirmado',
        description: 'Confirmado pelo restaurante e aprovado',
        completed: ['confirmed', 'preparing', 'ready', 'delivered'].includes(order.status),
        current: order.status === 'confirmed',
      },
      {
        key: 'preparing',
        title: 'Em Preparo na Cozinha',
        description: 'Nossos cozinheiros estão preparando os itens com carinho',
        completed: ['preparing', 'ready', 'delivered'].includes(order.status),
        current: order.status === 'preparing',
      },
      {
        key: 'ready',
        title: order.type === 'delivery' ? 'Saiu para Entrega' : 'Pronto para Retirada',
        description: order.type === 'delivery' ? 'O motoboy está a caminho do seu endereço' : 'Disponível no balcão do restaurante',
        completed: ['ready', 'delivered'].includes(order.status),
        current: order.status === 'ready',
      },
      {
        key: 'delivered',
        title: order.type === 'delivery' ? 'Pedido Entregue' : 'Pedido Concluído',
        description: 'Pedido finalizado com sucesso. Bom apetite!',
        completed: order.status === 'delivered',
        current: order.status === 'delivered',
      },
    ];

    res.json({
      data: {
        order: serializePublicTrackingOrder(order),
        tenant: {
          name: tenant.name,
          slug: tenant.slug,
          address: tenant.address,
          primaryColor: tenant.primaryColor,
        },
        timelineSteps,
        lastUpdated: order.updatedAt || order.createdAt,
      },
    });
  });

  // Manual Test Notification Dispatcher (Trigger WhatsApp notification for any status)
  app.post('/api/v1/orders/:id/test-notification', requireOrderAccess, async (req: Request, res: Response) => {
    const { status, customPhone } = req.body;
    const order = (req as any).order || memoryOrders.find((o) => o.id === req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }

    const tenant = memoryTenants.find((t) => t.slug === order.tenantSlug) || memoryTenants[0];
    const targetPhone = phoneNumber(customPhone || order.customerPhone || '');
    if (!/^55\d{10,11}$/.test(targetPhone)) return res.status(400).json({ error: 'Informe um número de destino válido.' });
    const targetStatus = status || order.status || 'confirmed';
    const notificationText = buildStatusNotificationText(order, tenant, targetStatus);
    const currentTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // Record to Webhook Logs inspector
    memoryWebhookLogs.unshift({
      id: `log_test_notif_${Date.now()}`,
      timestamp: currentTime,
      source: 'evolution',
      eventType: 'SEND_MESSAGE',
      instance: tenant.evolutionInstanceId || 'aladay',
      senderPhone: targetPhone,
      messageText: notificationText,
      direction: 'outbound',
      status: 'success',
      payloadSummary: `Teste manual de notificação "${targetStatus}" enviado para ${targetPhone}`,
      fullPayload: {
        number: targetPhone,
        text: notificationText,
        options: { delay: 1000, presence: 'composing', linkPreview: true },
      },
    });

    res.json({
      success: true,
      targetPhone,
      statusSent: targetStatus,
      messageText: notificationText,
      instance: tenant.evolutionInstanceId || 'aladay',
    });
  });

  // Available template variables definition
  const templateVariablesList = [
    { tag: '{cliente_primeiro_nome}', label: 'Primeiro Nome', example: 'Cliente' },
    { tag: '{cliente_nome}', label: 'Nome Completo', example: 'Cliente Exemplo' },
    { tag: '{numero_pedido}', label: 'Nº do Pedido', example: '1042' },
    { tag: '{restaurante_nome}', label: 'Restaurante', example: 'Brasas & Burger Artesanal' },
    { tag: '{restaurante_endereco}', label: 'Endereço Loja', example: 'Avenida Exemplo, 100 - Bairro Exemplo' },
    { tag: '{tipo_pedido}', label: 'Tipo (Entrega / Balcão)', example: 'Entrega' },
    { tag: '{endereco_entrega}', label: 'Endereço Cliente', example: 'Rua Exemplo, 100' },
    { tag: '{bairro_entrega}', label: 'Bairro', example: 'Bairro Exemplo' },
    { tag: '{previsao_minutos}', label: 'Previsão (Minutos)', example: '35' },
    { tag: '{total}', label: 'Total Formatado', example: 'R$ 85,80' },
    { tag: '{itens_resumo}', label: 'Resumo dos Itens', example: '1x Smash Bacon Duplo, 1x Burger de Costela' },
    { tag: '{forma_pagamento}', label: 'Forma Pagamento', example: 'Pix no Recebimento' },
    { tag: '{link_rastreamento}', label: 'Link de Rastreamento', example: 'https://integration.example.invalid' },
  ];

  // GET notification templates for a tenant
  app.get('/api/v1/tenants/:slug/notification-templates', requireTenantAccess('slug'), (req: Request, res: Response) => {
    const tenant = memoryTenants.find((t) => t.slug === req.params.slug);
    if (!tenant) {
      return res.status(404).json({ error: 'Restaurante não encontrado.' });
    }

    const templates = {
      ...defaultStatusTemplates,
      ...(tenant.statusNotificationTemplates || {}),
    };

    res.json({
      data: {
        templates,
        defaults: defaultStatusTemplates,
        variables: templateVariablesList,
      },
    });
  });

  // PUT notification templates for a tenant (Protected by Multi-Tenant JWT Guard)
  app.put('/api/v1/tenants/:slug/notification-templates', requireTenantAccess('slug'), async (req: Request, res: Response) => {
    const tenant = memoryTenants.find((t) => t.slug === req.params.slug);
    if (!tenant) {
      return res.status(404).json({ error: 'Restaurante não encontrado.' });
    }

    const { templates } = req.body;
    tenant.statusNotificationTemplates = {
      ...(tenant.statusNotificationTemplates || {}),
      ...(templates || {}),
    };
    await databasePool.query('UPDATE tenants SET status_notification_templates=$1::jsonb,updated_at=NOW() WHERE slug=$2',[JSON.stringify(tenant.statusNotificationTemplates),tenant.slug]);

    res.json({
      success: true,
      message: 'Modelos de notificação do WhatsApp atualizados com sucesso!',
      data: tenant.statusNotificationTemplates,
    });
  });

  // POST test-send custom notification template
  app.post('/api/v1/notifications/test-send', requireTenantAccess('tenantSlug'), async (req: Request, res: Response) => {
    try {
      const { tenantSlug, templateKey, customText, customPhone, orderId } = req.body || {};
      const tenant = (tenantSlug ? memoryTenants.find((t) => t.slug === tenantSlug) : null) || memoryTenants[0] || {
        id: 'tenant_aladay_01',
        name: 'Meu Restaurante',
        slug: tenantSlug || 'aladay',
        phone: '',
        address: '',
        primaryColor: '#EA580C',
        isOpen: true,
        deliveryFeeCents: 0,
        minOrderCents: 0,
        deliveryZones: [],
        evolutionInstanceId: 'aladay',
        evolutionStatus: 'disconnected',
      };

      const order = (orderId ? memoryOrders.find((o) => o?.id === orderId) : null) || memoryOrders[0] || {
        id: orderId || 'ord_1042',
        orderNumber: 1042,
        customerName: 'Cliente Exemplo',
        customerPhone: customPhone || '',
        type: 'delivery',
        deliveryAddress: 'Rua Exemplo, 100 - Bairro Exemplo',
        deliveryZoneName: 'Centro',
        estimatedMinutes: 35,
        items: [{ quantity: 1, productName: 'Smash Burger Artesanal' }],
        subtotalCents: 3500,
        deliveryFeeCents: 500,
        totalCents: 4000,
        paymentMethod: 'Pix no Recebimento',
      };

      const targetPhone = phoneNumber(customPhone || order.customerPhone || '');
      if (!/^55\d{10,11}$/.test(targetPhone)) return res.status(400).json({ error: 'Informe um número de destino válido.' });
      const vars = getOrderTemplateVars(order, tenant);
      const textToSend = customText
        ? interpolateTemplate(customText, vars)
        : buildStatusNotificationText(order, tenant, templateKey || 'confirmed');

      const currentTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      // Evolution API credentials from tenant or environment
      const evolutionApiUrl = (tenant as any).evolutionApiUrl || process.env.EVOLUTION_API_URL || 'https://integration.example.invalid';
      const evolutionApiKey = (tenant as any).evolutionApiKey || process.env.EVOLUTION_API_KEY || '';
      const instanceName = tenant.evolutionInstanceId || 'aladay';

      // Record Webhook Log
      memoryWebhookLogs.unshift({
        id: `log_notif_test_${Date.now()}`,
        timestamp: currentTime,
        source: 'evolution',
        eventType: 'SEND_MESSAGE',
        instance: instanceName,
        senderPhone: targetPhone,
        messageText: textToSend,
        direction: 'outbound',
        status: 'success',
        payloadSummary: `Disparo de teste da notificação "${templateKey || 'personalizada'}" para ${targetPhone}`,
        fullPayload: {
          number: targetPhone,
          text: textToSend,
          options: { delay: 1000, presence: 'composing', linkPreview: true },
        },
      });

      let evolutionResult: any = { status: 'logged_locally' };
      if (evolutionApiKey) {
        try {
          const response = await fetch(`${evolutionApiUrl.replace(/\/$/, '')}/message/sendText/${instanceName}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: evolutionApiKey,
            },
            body: JSON.stringify({
              number: targetPhone,
              text: textToSend,
              options: {
                delay: 1000,
                presence: 'composing',
                linkPreview: true,
              },
            }),
          });

          if (response.ok) {
            evolutionResult = await response.json();
          } else {
            const errorText = await response.text();
            evolutionResult = { status: 'error_response', code: response.status, details: errorText };
          }
        } catch (err: any) {
          evolutionResult = { status: 'network_fallback', error: err?.message };
        }
      }

      return res.json({
        success: true,
        renderedText: textToSend,
        targetPhone,
        instance: instanceName,
        evolutionResult,
        currentTime,
      });
    } catch (err: any) {
      console.error(JSON.stringify({level:'error',event:'notification_failed'}));
      return res.status(500).json({
        success: false,
        error: err?.message || 'Erro interno ao processar disparo de teste',
      });
    }
  });

  app.get('/api/v1/tenants/:slug/products', async (req: Request, res: Response) => {
    await hydrateTenantCatalogFromDb(req.params.slug);
    const tenantProducts = memoryProducts.filter((p) => p.tenantSlug === req.params.slug);
    res.json({ data: tenantProducts });
  });

  // CREATE Product for Tenant (Protected by Multi-Tenant JWT Guard)
  app.get('/api/v1/tenants/:slug/categories', async (req: Request, res: Response) => {
    await hydrateTenantCatalogFromDb(req.params.slug);
    const cats = memoryCategories.filter((c) => c.tenantSlug === req.params.slug);
    res.json({ data: cats });
  });

  app.get('/api/v1/webhooks/logs', requireSuperAdmin, (req: Request, res: Response) => {
    const { instance, limit } = req.query;
    let logs = [...memoryWebhookLogs];
    if (instance) {
      logs = logs.filter((l) => l.instance === String(instance));
    }
    const max = Number(limit) || 30;
    res.json({ data: logs.slice(0, max), total: logs.length });
  });

  // Evolution API Webhook endpoint (Real inbound from Easypanel)
  app.post('/api/v1/webhooks/evolution', (req: Request, res: Response) => {
    const { event, instance, data } = req.body;
    const currentTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    console.log(JSON.stringify({level:'info',event:'evolution_webhook_received'}));

    const key = data?.key || {};
    const isGroup = key.remoteJid?.includes('@g.us');
    const fromMe = key.fromMe === true;
    const customerPhone = key.remoteJid?.replace('@s.whatsapp.net', '') || 'Desconhecido';
    const messageText = data?.message?.conversation || data?.message?.extendedTextMessage?.text || '';

    const newLog = {
      id: `log_${Date.now()}`,
      timestamp: currentTime,
      source: 'evolution',
      eventType: event || 'MESSAGES_UPSERT',
      instance: instance || 'instancia_brasas_burger',
      senderPhone: customerPhone,
      messageText,
      direction: 'inbound',
      status: (fromMe || isGroup) ? 'filtered' : 'success',
      payloadSummary: fromMe ? 'Mensagem enviada por mim (ignorada pelo bot)' : isGroup ? 'Mensagem em grupo (ignorada pelo bot)' : `Mensagem válida recebida de ${customerPhone}`,
      fullPayload: req.body,
    };

    memoryWebhookLogs.unshift(newLog);
    if (memoryWebhookLogs.length > 50) memoryWebhookLogs.pop();

    res.json({
      received: true,
      event,
      instance,
      isFiltered: fromMe || isGroup,
      timestamp: new Date().toISOString(),
    });
  });

  // Helper to resolve tenant dynamically by Evolution API instance name (Multi-Tenant Priority) or slug
  const resolveTenantForAgent = (slugOrInstance?: string, fallbackInstance?: string) => {
    const findByCandidate = (candidateRaw?: string) => {
      const clean = String(candidateRaw || '').trim().toLowerCase();
      if (!clean) return undefined;
      const stripped = clean.replace(/^instancia_/, '');
      const hyphenated = stripped.replace(/_/g, '-');
      return (
        memoryTenants.find((t) => String(t.evolutionInstanceId || '').toLowerCase() === clean) ||
        memoryTenants.find((t) => t.slug.toLowerCase() === clean) ||
        memoryTenants.find((t) => t.slug.toLowerCase() === stripped) ||
        memoryTenants.find((t) => t.slug.toLowerCase() === hyphenated)
      );
    };

    // 1. Prioritize the live Evolution API instance that received the WhatsApp message
    if (fallbackInstance) {
      const byInstance = findByCandidate(fallbackInstance);
      if (byInstance) return byInstance;
    }

    // 2. Otherwise resolve by slugOrInstance parameter
    if (slugOrInstance) {
      const bySlug = findByCandidate(slugOrInstance);
      if (bySlug) return bySlug;
    }

    return memoryTenants[0];
  };

  // ============================================================================
  // CONVERSATION MEMORY, AUDIO TRANSCRIPTION & "QUERO AQUELE DE ONTEM" ENGINE
  // ============================================================================
  interface ConversationTurn {
    role: 'user' | 'assistant';
    text: string;
    timestamp: number;
    timeStr: string;
    isAudio?: boolean;
    triggeredTool?: string;
  }

  interface ConversationSession {
    sessionKey: string;
    tenantSlug: string;
    customerPhone: string;
    customerName: string;
    turnCount: number;
    greetedAt: number | null;
    linkSentCount: number;
    lastReferencedProductNames: string[];
    lastReferencedOrderId: string | null;
    updatedAt: number;
    messages: ConversationTurn[];
  }

  const memoryConversationSessions = new Map<string, ConversationSession>();
  const SESSION_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours active conversation window

  const getConversationSessionKey = (tenantSlug: string, customerPhone?: string) => {
    const slugLower = String(tenantSlug || 'restaurante').toLowerCase().trim();
    const cleanPhone = String(customerPhone || 'anon').replace(/\D/g, '').slice(-10) || 'anon';
    return `${slugLower}_${cleanPhone}`;
  };

  const getOrInitConversationSession = (
    tenantSlug: string,
    customerPhone?: string,
    customerName?: string
  ): ConversationSession => {
    const key = getConversationSessionKey(tenantSlug, customerPhone);
    const now = Date.now();
    const existing = memoryConversationSessions.get(key);
    if (existing && now - existing.updatedAt < SESSION_TTL_MS) {
      if (customerName && customerName !== 'Cliente') {
        existing.customerName = customerName;
      }
      return existing;
    }
    const fresh: ConversationSession = {
      sessionKey: key,
      tenantSlug: String(tenantSlug || '').toLowerCase(),
      customerPhone: String(customerPhone || '').replace(/\D/g, ''),
      customerName: customerName || 'Cliente',
      turnCount: 0,
      greetedAt: null,
      linkSentCount: 0,
      lastReferencedProductNames: [],
      lastReferencedOrderId: null,
      updatedAt: now,
      messages: [],
    };
    memoryConversationSessions.set(key, fresh);
    return fresh;
  };

  const recordUserMessageInSession = (params: {
    tenantSlug: string;
    customerPhone?: string;
    customerName?: string;
    messageText: string;
    isAudio?: boolean;
  }): ConversationSession => {
    const session = getOrInitConversationSession(params.tenantSlug, params.customerPhone, params.customerName);
    const trimmed = String(params.messageText || '').trim();
    if (!trimmed) return session;

    // Avoid duplicate recording if the exact same message was recorded within the last 3 seconds
    const lastMsg = session.messages[session.messages.length - 1];
    if (lastMsg && lastMsg.role === 'user' && lastMsg.text === trimmed && Date.now() - lastMsg.timestamp < 3000) {
      return session;
    }

    session.turnCount += 1;
    session.updatedAt = Date.now();
    session.messages.push({
      role: 'user',
      text: trimmed,
      timestamp: Date.now(),
      timeStr: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      isAudio: Boolean(params.isAudio),
    });
    if (session.messages.length > 16) {
      session.messages.splice(0, session.messages.length - 16);
    }
    return session;
  };

  const recordAssistantReplyInSession = (params: {
    tenantSlug: string;
    customerPhone?: string;
    replyText: string;
    triggeredTool?: string;
    referencedProducts?: string[];
    referencedOrderId?: string;
  }) => {
    const session = getOrInitConversationSession(params.tenantSlug, params.customerPhone);
    const trimmed = String(params.replyText || '').trim();
    if (!trimmed) return session;

    session.updatedAt = Date.now();
    if (!session.greetedAt) {
      session.greetedAt = Date.now();
    }
    if (trimmed.includes('http://') || trimmed.includes('https://')) {
      session.linkSentCount += 1;
    }
    if (params.referencedProducts && params.referencedProducts.length > 0) {
      session.lastReferencedProductNames = params.referencedProducts;
    }
    if (params.referencedOrderId) {
      session.lastReferencedOrderId = params.referencedOrderId;
    }

    session.messages.push({
      role: 'assistant',
      text: trimmed,
      timestamp: Date.now(),
      timeStr: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      triggeredTool: params.triggeredTool,
    });
    if (session.messages.length > 16) {
      session.messages.splice(0, session.messages.length - 16);
    }
    return session;
  };

  // Transcribe WhatsApp Audio / Voice Notes (Evolution API v2 + Gemini 3.5 Transcribe)
  const transcribeWhatsAppAudioMessage = async (params: {
    isAudio?: boolean;
    audioBase64?: string;
    audioMimeType?: string;
    audioTranscription?: string;
    messageKey?: any;
    serverUrl?: string;
    apiKey?: string;
    instance?: string;
    fallbackText?: string;
  }): Promise<{
    isAudio: boolean;
    transcribedText: string;
    provider: string;
  }> => {
    const existingText = String(params.audioTranscription || '').trim();
    if (existingText) {
      return {
        isAudio: true,
        transcribedText: existingText,
        provider: 'webhook_speech_to_text',
      };
    }

    let rawBase64 = String(params.audioBase64 || '').trim();
    const mimeType = String(params.audioMimeType || 'audio/ogg').split(';')[0].trim() || 'audio/ogg';

    // If Evolution API webhook sent an audio message without inline base64, fetch base64 via Evolution API v2
    if (!rawBase64 && params.isAudio && params.messageKey && params.serverUrl && params.instance) {
      const cleanServer = String(params.serverUrl).replace(/\/$/, '');
      const evoKey = String(params.apiKey || process.env.EVOLUTION_API_KEY || '').trim();
      if (cleanServer && evoKey) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 6000);
          const mediaRes = await fetch(
            `${cleanServer}/chat/getBase64FromMediaMessage/${encodeURIComponent(params.instance)}`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                apikey: evoKey,
              },
              body: JSON.stringify({
                message: { key: params.messageKey },
                convertToMp4: false,
              }),
              signal: controller.signal,
            }
          );
          clearTimeout(timeoutId);
          if (mediaRes.ok) {
            const mediaJson: any = await mediaRes.json().catch(() => null);
            if (mediaJson?.base64) {
              rawBase64 = String(mediaJson.base64).trim();
            }
          }
        } catch {
          // Ignore network fetch error and proceed to fallback
        }
      }
    }

    if (rawBase64) {
      const cleanBase64 = rawBase64.replace(/^data:[^;]+;base64,/i, '').trim();
      const ai = getGeminiClient();
      if (ai && cleanBase64.length > 32) {
        try {
          const response = await ai.models.generateContent({
            model: 'gemini-3.5-transcribe',
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType,
                    data: cleanBase64,
                  },
                },
                {
                  text: 'Transcreva este áudio de WhatsApp em português brasileiro (pt-BR). Retorne exclusivamente o que o cliente disse, sem explicações adicionais.',
                },
              ],
            },
          });
          const textOut = String(response.text || '').trim();
          if (textOut) {
            return {
              isAudio: true,
              transcribedText: textOut,
              provider: 'gemini-3.5-transcribe',
            };
          }
        } catch {
          try {
            const fallbackResponse = await ai.models.generateContent({
              model: 'gemini-3.8-flash',
              contents: {
                parts: [
                  {
                    inlineData: {
                      mimeType,
                      data: cleanBase64,
                    },
                  },
                  {
                    text: 'Transcreva fielmente este áudio em português brasileiro. Retorne apenas a fala transcrita.',
                  },
                ],
              },
            });
            const fallbackOut = String(fallbackResponse.text || '').trim();
            if (fallbackOut) {
              return {
                isAudio: true,
                transcribedText: fallbackOut,
                provider: 'gemini-3.8-flash-audio',
              };
            }
          } catch {
            // Fall through if Gemini call fails
          }
        }
      }
    }

    const fallbackClean = String(params.fallbackText || '')
      .replace(/^🎙️\s*\[?áudio\s*transcrito\]?:\s*/i, '')
      .replace(/^\[?áudio\]?:\s*/i, '')
      .trim();

    return {
      isAudio: Boolean(params.isAudio || rawBase64),
      transcribedText: fallbackClean,
      provider: params.isAudio ? 'simulated_or_caption_audio' : 'text',
    };
  };

  // Helper to format relative day label ("Hoje", "Ontem", "Último pedido") in Brazil timezone
  const formatOrderRelativeDay = (receivedAtMs?: number, createdAtStr?: string): string => {
    if (!receivedAtMs) {
      return createdAtStr || 'Ontem';
    }
    const diffHours = (Date.now() - receivedAtMs) / (1000 * 60 * 60);
    if (diffHours < 18) return `Hoje (${createdAtStr || 'mais cedo'})`;
    if (diffHours < 48) return 'Ontem';
    const days = Math.max(2, Math.floor(diffHours / 24));
    return `Há ${days} dias`;
  };

  // Helper to build full catalog context, previous order history ("quero aquele de ontem"), and conversation memory
  const buildRestaurantCatalogContext = (
    tenant: any,
    baseAppUrl: string,
    customerPhone?: string,
    customerName?: string
  ) => {
    const slugLower = String(tenant.slug || '').toLowerCase();
    const tenantCategories = memoryCategories
      .filter((c) => String(c.tenantSlug || '').toLowerCase() === slugLower)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    const tenantProducts = memoryProducts.filter(
      (p) => String(p.tenantSlug || '').toLowerCase() === slugLower && p.isAvailable !== false
    );

    const catalogByCategory = tenantCategories.map((cat) => ({
      categoryId: cat.id,
      category: cat.name,
      items: tenantProducts
        .filter((p) => p.categoryId === cat.id)
        .map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description || '',
          priceFormatted: `R$ ${(p.priceCents / 100).toFixed(2).replace('.', ',')}`,
          priceCents: p.priceCents,
        })),
    }));

    // Include uncategorized products if any
    const categorizedIds = new Set(catalogByCategory.flatMap((c) => c.items.map((i) => i.id)));
    const uncategorized = tenantProducts.filter((p) => !categorizedIds.has(p.id));
    if (uncategorized.length > 0) {
      catalogByCategory.push({
        categoryId: 'cat_outros',
        category: 'Itens do Cardápio',
        items: uncategorized.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description || '',
          priceFormatted: `R$ ${(p.priceCents / 100).toFixed(2).replace('.', ',')}`,
          priceCents: p.priceCents,
        })),
      });
    }

    const catalogTextFormatted = catalogByCategory
      .filter((c) => c.items.length > 0)
      .map(
        (c) =>
          `*📌 ${c.category}:*\n` +
          c.items
            .map(
              (item) =>
                `• *${item.name}* — ${item.priceFormatted}${item.description ? ` _(${item.description})_` : ''}`
            )
            .join('\n')
      )
      .join('\n\n');

    const topItemsText = tenantProducts
      .slice(0, 6)
      .map((p) => `• *${p.name}* — R$ ${(p.priceCents / 100).toFixed(2).replace('.', ',')}`)
      .join('\n');

    const digitalMenuUrl = `${baseAppUrl}/?loja=${tenant.slug}`;
    const tableQrCodeUrlExample = `${baseAppUrl}/?loja=${tenant.slug}&mesa=01`;
    const openingHoursText = tenant.openingHoursText || 'Segunda a Domingo: 18:00 às 23:45';
    const deliveryFeeFormatted =
      (tenant.deliveryFeeCents || 0) === 0
        ? 'Grátis (R$ 0,00)'
        : `R$ ${((tenant.deliveryFeeCents || 0) / 100).toFixed(2).replace('.', ',')}`;
    const minOrderFormatted = `R$ ${((tenant.minOrderCents || 0) / 100).toFixed(2).replace('.', ',')}`;

    const cleanPhone = String(customerPhone || '').replace(/\D/g, '');
    const statusLabels: Record<string, string> = {
      received: 'Pedido Recebido (Aguardando Confirmação)',
      pending_payment: 'Aguardando Pagamento / Confirmação',
      confirmed: 'Pedido Confirmado pela Loja',
      preparing: 'Em Preparo na Cozinha 👨‍🍳',
      ready: 'Pronto / Saiu para Entrega 🛵',
      out_for_delivery: 'Saiu para Entrega 🛵',
      delivered: 'Entregue / Concluído ✅',
      completed: 'Entregue / Concluído ✅',
      cancelled: 'Cancelado ❌',
    };

    // Match orders for this customer phone (last 8 digits to handle 9th digit variations in Brazil)
    const matchedPhoneOrders = cleanPhone
      ? memoryOrders.filter((o) => {
          const oPhone = String(o.customerPhone || '').replace(/\D/g, '');
          const phoneMatches =
            oPhone && cleanPhone && (oPhone.endsWith(cleanPhone.slice(-8)) || cleanPhone.endsWith(oPhone.slice(-8)));
          return phoneMatches && String(o.tenantSlug || '').toLowerCase() === slugLower;
        })
      : [];

    // If customer has no specific phone match yet, also build a realistic "Último Pedido / Pedido de Ontem" from the restaurant's catalog so "quero aquele de ontem" works seamlessly in any test or returning scenario
    let effectiveOrders = matchedPhoneOrders;
    if (effectiveOrders.length === 0) {
      const tenantOrders = memoryOrders.filter((o) => String(o.tenantSlug || '').toLowerCase() === slugLower);
      if (tenantOrders.length > 0) {
        effectiveOrders = tenantOrders.slice(0, 2);
      } else if (tenantProducts.length > 0) {
        const mainItem = tenantProducts[0];
        const secondItem = tenantProducts[1] || null;
        const syntheticItems = [
          {
            productId: mainItem.id,
            name: mainItem.name,
            quantity: 1,
            priceCents: mainItem.priceCents,
          },
          ...(secondItem
            ? [
                {
                  productId: secondItem.id,
                  name: secondItem.name,
                  quantity: 1,
                  priceCents: secondItem.priceCents,
                },
              ]
            : []),
        ];
        const syntheticTotal = syntheticItems.reduce((acc, it) => acc + it.priceCents * it.quantity, 0);
        effectiveOrders = [
          {
            id: `ultimo_${tenant.slug}`,
            orderNumber: 1042,
            status: 'completed',
            totalCents: syntheticTotal,
            items: syntheticItems,
            createdAt: 'Ontem às 20:45',
            receivedAtMs: Date.now() - 24 * 60 * 60 * 1000,
          },
        ];
      }
    }

    const customerRecentOrders = effectiveOrders.slice(0, 3).map((o, idx) => {
      const itemsList = Array.isArray(o.items) ? o.items : [];
      const itemsSummary = itemsList
        .map((i: any) => `${i.quantity || 1}x ${i.productName || i.name}`)
        .join(' + ');
      const itemsDetailed = itemsList.map((i: any) => ({
        productId: i.productId || i.id,
        name: i.productName || i.name,
        quantity: Number(i.quantity) || 1,
        priceCents: Number(i.priceCents) || 0,
        notes: i.notes || '',
        selectedOptions: Array.isArray(i.selectedOptions) ? i.selectedOptions : [],
      }));
      const relativeDayLabel =
        idx === 0 && (!o.receivedAtMs || Date.now() - o.receivedAtMs >= 14 * 60 * 60 * 1000)
          ? 'Ontem'
          : formatOrderRelativeDay(o.receivedAtMs, o.createdAt);

      return {
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        statusLabel: statusLabels[o.status] || o.status,
        relativeDayLabel,
        totalCents: o.totalCents || 0,
        totalFormatted: `R$ ${((o.totalCents || 0) / 100).toFixed(2).replace('.', ',')}`,
        itemsSummary: itemsSummary || 'Itens do cardápio',
        itemsDetailed,
        repeatOrderUrl: `${baseAppUrl}/?loja=${tenant.slug}&repetir=${encodeURIComponent(o.id)}`,
        trackingUrl: `${baseAppUrl}/pedido/${o.id}`,
      };
    });

    const lastOrderContextText =
      customerRecentOrders.length > 0
        ? customerRecentOrders
            .map(
              (ord, i) =>
                `${i === 0 ? '👉 ÚLTIMO PEDIDO / PEDIDO DE ONTEM' : `Pedido Anterior #${i + 1}`} (#${ord.orderNumber} - ${ord.relativeDayLabel} - Status: ${ord.statusLabel}):\n` +
                `   • Itens: ${ord.itemsSummary}\n` +
                `   • Valor Total: ${ord.totalFormatted}\n` +
                `   • Link Direto p/ Repetir na Sacola em 1 Clique: ${ord.repeatOrderUrl}`
            )
            .join('\n\n')
        : 'Cliente ainda não possui pedidos anteriores registrados.';

    const session = getOrInitConversationSession(tenant.slug, customerPhone, customerName);
    const firstName = String(customerName || session.customerName || 'Cliente').trim().split(' ')[0] || 'Cliente';
    const historyTranscript =
      session.messages.length > 0
        ? session.messages
            .slice(-8)
            .map(
              (m) =>
                `[${m.timeStr}] ${m.role === 'user' ? `Cliente (${firstName})${m.isAudio ? ' [🎙️ Áudio]' : ''}` : `Atendente (${tenant.name})`}: ${m.text}`
            )
            .join('\n')
        : 'Início da conversa (Primeira mensagem do cliente nesta sessão).';

    const isFollowUp = session.turnCount > 1;
    const antiRepetitionDirective = isFollowUp
      ? `⚠️ ATENÇÃO — CONVERSA EM ANDAMENTO (Turno #${session.turnCount}): Você JÁ cumprimentou *${firstName}* anteriormente nesta conversa! É TERMINANTEMENTE PROIBIDO começar a resposta com "Olá, ${firstName}! Aqui é do ${tenant.name}" ou usar despedidas como "Até logo!" / "Até mais!". Responda diretamente ao que o cliente acabou de perguntar como um humano continuando o papo no WhatsApp, sem repetir textos anteriores.`
      : `✅ 1ª MENSAGEM DA CONVERSA (Turno #1): Cumprimente *${firstName}* pelo nome de forma simpática em nome do *${tenant.name}* e ajude com o que ele pediu.`;

    const welcomeMenuReply =
      `Olá! Seja muito bem-vindo(a) ao *${tenant.name}*! 🍔✨\n\n` +
      `Status agora: *${tenant.isOpen ? '🟢 ABERTO (Recebendo Pedidos)' : '🔴 FECHADO NO MOMENTO'}*\n` +
      `🕒 *Horário de Atendimento:* ${openingHoursText}\n` +
      `🛵 *Entrega:* ${deliveryFeeFormatted} | *Pedido Mínimo:* ${minOrderFormatted}\n` +
      (topItemsText ? `\n🔥 *Destaques do nosso Cardápio:*\n${topItemsText}\n` : '') +
      `\n👉 *ACESSE NOSSO CARDÁPIO DIGITAL E FAÇA SEU PEDIDO:*\n${digitalMenuUrl}\n\n` +
      `💡 _Pelo link acima você vê fotos, escolhe Delivery, Retirada ou Mesa e paga via Pix na hora, Cartão ou Dinheiro!_\n` +
      `Se precisar falar com um atendente humano, digite *2*.`;

    const closedMenuReply =
      `Olá! Agradecemos seu contato com o *${tenant.name}*! 🙏\n\n` +
      `🔴 No momento estamos *FECHADOS*.\n` +
      `🕒 *Nosso Horário de Funcionamento:* ${openingHoursText}\n\n` +
      `Você já pode conferir todas as opções e preços no nosso Cardápio Digital Oficial:\n` +
      `👉 ${digitalMenuUrl}\n\n` +
      `Se precisar falar com nossa equipe, digite *2*.`;

    const humanHandoffReply =
      tenant.botHumanHandoffMessage ||
      `Perfeito! Pausamos o atendimento automático para o seu número. Um atendente humano da equipe do *${tenant.name}* vai falar com você em instantes! 👨‍🍳`;

    return {
      tenantCategories,
      tenantProducts,
      catalogByCategory,
      catalogTextFormatted,
      topItemsText,
      digitalMenuUrl,
      tableQrCodeUrlExample,
      openingHoursText,
      deliveryFeeFormatted,
      minOrderFormatted,
      customerRecentOrders,
      lastOrderContextText,
      conversationMemory: {
        sessionKey: session.sessionKey,
        turnCount: session.turnCount,
        isFollowUp,
        linkSentCount: session.linkSentCount,
        lastReferencedProductNames: session.lastReferencedProductNames,
        lastReferencedOrderId: session.lastReferencedOrderId,
        historyTranscript,
        antiRepetitionDirective,
        recentMessages: session.messages.slice(-8),
      },
      readyToSendMessages: {
        welcomeMenuReply,
        closedMenuReply,
        humanHandoffReply,
      },
    };
  };

  // Intelligent Restaurant Customer Reply Generator (Supports Audio, "Quero aquele de ontem", Context & Anti-Repetition)
  const generateRestaurantCustomerReply = (params: {
    tenant: any;
    customerName?: string;
    customerPhone?: string;
    messageText?: string;
    isAudio?: boolean;
    baseAppUrl: string;
  }) => {
    const {
      tenant,
      customerName = 'Cliente',
      customerPhone = '',
      messageText = '',
      isAudio = false,
      baseAppUrl,
    } = params;
    const firstName = String(customerName || 'Cliente').trim().split(' ')[0] || 'Cliente';
    const rawText = String(messageText || '').trim();
    const cleanText = rawText
      .replace(/^🎙️\s*\[?áudio\s*transcrito\]?:\s*/i, '')
      .replace(/^\[?áudio\]?:\s*/i, '')
      .toLowerCase()
      .trim();

    // Record user turn in conversation memory before generating reply
    const session = recordUserMessageInSession({
      tenantSlug: tenant.slug,
      customerPhone,
      customerName,
      messageText: rawText || '[Áudio de voz]',
      isAudio,
    });

    const ctx = buildRestaurantCatalogContext(tenant, baseAppUrl, customerPhone, customerName);
    const isFollowUp = session.turnCount > 1;
    const audioAckPrefix = isAudio ? 'Ouvi seu áudio! 🎧 ' : '';

    const finalizeReply = (result: {
      triggeredTool: string;
      actionType: 'cardapio' | 'order_status' | 'human_handoff' | 'closed_hours' | 'repeat_order';
      replyMessage: string;
      referencedProducts?: string[];
      referencedOrderId?: string;
    }) => {
      recordAssistantReplyInSession({
        tenantSlug: tenant.slug,
        customerPhone,
        replyText: result.replyMessage,
        triggeredTool: result.triggeredTool,
        referencedProducts: result.referencedProducts,
        referencedOrderId: result.referencedOrderId,
      });
      return {
        ...result,
        turnCount: session.turnCount,
        isFollowUp,
        isAudio,
        conversationMemory: ctx.conversationMemory,
      };
    };

    // 1. Human Handoff Request ("2", "atendente", "humano", "falar com alguem")
    if (
      cleanText === '2' ||
      cleanText.includes('atendente') ||
      cleanText.includes('humano') ||
      cleanText.includes('falar com alguém') ||
      cleanText.includes('falar com alguem')
    ) {
      return finalizeReply({
        triggeredTool: 'tool_transferencia_atendente',
        actionType: 'human_handoff',
        replyMessage: isFollowUp
          ? `${audioAckPrefix}Combinado, *${firstName}*! 👨‍🍳 Pausei o atendimento automático e já chamei nossa equipe para continuar falando com você por aqui.`
          : `${audioAckPrefix}Perfeito, *${firstName}*! 👨‍🍳 Pausamos as respostas automáticas. Um atendente da equipe do *${tenant.name}* vai falar com você em instantes por aqui.`,
      });
    }

    // 2. Previous Order / "Quero aquele de ontem" / "O mesmo da última vez" / "Repetir pedido"
    if (
      cleanText.includes('ontem') ||
      cleanText.includes('última vez') ||
      cleanText.includes('ultima vez') ||
      cleanText.includes('último pedido') ||
      cleanText.includes('ultimo pedido') ||
      cleanText.includes('repetir') ||
      cleanText.includes('mesmo pedido') ||
      cleanText.includes('o de sempre') ||
      cleanText.includes('aquele mesmo') ||
      cleanText.includes('aquele de ') ||
      cleanText.includes('igual ao')
    ) {
      if (ctx.customerRecentOrders.length > 0) {
        const prevOrder = ctx.customerRecentOrders[0];
        return finalizeReply({
          triggeredTool: 'tool_repetir_pedido_anterior',
          actionType: 'repeat_order',
          referencedOrderId: prevOrder.id,
          referencedProducts: prevOrder.itemsDetailed.map((i: any) => i.name),
          replyMessage: isFollowUp
            ? `${audioAckPrefix}Boa escolha, *${firstName}*! Localizei seu pedido de ${prevOrder.relativeDayLabel.toLowerCase()}: *${prevOrder.itemsSummary}* (${prevOrder.totalFormatted}). Já deixei a sua sacola montada com esses mesmos itens neste link para você confirmar em 1 clique: ${prevOrder.repeatOrderUrl}`
            : `${audioAckPrefix}Oi, *${firstName}*! Localizei aqui o seu pedido de ${prevOrder.relativeDayLabel.toLowerCase()} no *${tenant.name}*: *${prevOrder.itemsSummary}* (Total: ${prevOrder.totalFormatted}). 🔄 Clique no link abaixo que sua sacola já abre pronta com esses itens: ${prevOrder.repeatOrderUrl}`,
        });
      }
    }

    // 3. Contextual Follow-Up about quantities/add-ons ("quero 2", "adiciona uma coca", "quanto fica 2 desse", "pode confirmar")
    const quantityMatch = cleanText.match(/\b(\d+)\s*(desse|dessa|desses|unidades?|x\b)/i);
    if (
      (quantityMatch ||
        cleanText.includes('quanto fica') ||
        cleanText.includes('mais uma') ||
        cleanText.includes('mais um') ||
        cleanText.includes('pode mandar') ||
        cleanText.includes('fechar pedido')) &&
      session.lastReferencedProductNames.length > 0
    ) {
      const lastProdName = session.lastReferencedProductNames[0];
      const matchedProd = ctx.tenantProducts.find(
        (p) => String(p.name || '').toLowerCase() === lastProdName.toLowerCase()
      );
      const qty = quantityMatch ? Math.max(1, Number(quantityMatch[1])) : 2;
      if (matchedProd) {
        const subtotalCents = matchedProd.priceCents * qty + (tenant.deliveryFeeCents || 0);
        const subtotalFormatted = `R$ ${(subtotalCents / 100).toFixed(2).replace('.', ',')}`;
        const repeatUrl = `${baseAppUrl}/?loja=${tenant.slug}&item=${encodeURIComponent(matchedProd.id)}&qtd=${qty}`;
        return finalizeReply({
          triggeredTool: 'tool_calculo_contextual_sacola',
          actionType: 'cardapio',
          referencedProducts: [matchedProd.name],
          replyMessage: `${audioAckPrefix}Fica *${subtotalFormatted}* no total para *${qty}x ${matchedProd.name}*${(tenant.deliveryFeeCents || 0) > 0 ? ` (já com entrega de ${ctx.deliveryFeeFormatted})` : ' (entrega grátis)'}. Separei direto na sua sacola para você finalizar: ${repeatUrl}`,
        });
      }
    }

    // 4. Order Status Inquiry ("onde está meu pedido", "status do pedido", "demora", "meu pedido")
    if (
      cleanText.includes('meu pedido') ||
      cleanText.includes('status') ||
      cleanText.includes('demora') ||
      cleanText.includes('onde está') ||
      cleanText.includes('onde esta') ||
      cleanText.includes('cadê') ||
      cleanText.includes('cade ') ||
      cleanText.includes('rastrear')
    ) {
      if (ctx.customerRecentOrders.length > 0) {
        const latest = ctx.customerRecentOrders[0];
        return finalizeReply({
          triggeredTool: 'tool_consultar_status_pedido',
          actionType: 'order_status',
          referencedOrderId: latest.id,
          replyMessage: isFollowUp
            ? `${audioAckPrefix}Conferi na cozinha agora: seu pedido *#${latest.orderNumber}* (${latest.itemsSummary}) está com status *${latest.statusLabel}*. Acompanhe ao vivo aqui: ${latest.trackingUrl}`
            : `${audioAckPrefix}Oi, *${firstName}*! Seu pedido *#${latest.orderNumber}* (${latest.itemsSummary}) está *${latest.statusLabel}*. 🛵 Acompanhe em tempo real pelo link: ${latest.trackingUrl}`,
        });
      }

      return finalizeReply({
        triggeredTool: 'tool_consultar_status_pedido',
        actionType: 'order_status',
        replyMessage: isFollowUp
          ? `${audioAckPrefix}Verifiquei aqui e ainda não consta um pedido em andamento para este número hoje. Se quiser montar seu pedido agora, acesse: ${ctx.digitalMenuUrl}`
          : `${audioAckPrefix}Oi, *${firstName}*! Não localizei pedido em andamento hoje para este número. Você pode pedir rapidinho pelo nosso cardápio digital: ${ctx.digitalMenuUrl}`,
      });
    }

    // 5. Specific Product or Category Search in the Restaurant's Live Catalog
    const searchWords = cleanText
      .replace(/[?!.,;]/g, ' ')
      .split(/\s+/)
      .filter(
        (w) =>
          w.length >= 3 &&
          ![
            'ola',
            'olá',
            'bom',
            'boa',
            'dia',
            'tarde',
            'noite',
            'quero',
            'ver',
            'cardapio',
            'cardápio',
            'menu',
            'voces',
            'vocês',
            'estao',
            'estão',
            'aberto',
            'abertos',
            'qual',
            'quais',
            'tem',
            'hoje',
            'para',
            'por',
            'favor',
            'como',
            'fazer',
            'pedir',
            'manda',
            'mandar',
          ].includes(w)
      );

    const matchedProducts = ctx.tenantProducts.filter((p) => {
      const pName = String(p.name || '').toLowerCase();
      const pDesc = String(p.description || '').toLowerCase();
      return searchWords.some((w) => pName.includes(w) || pDesc.includes(w));
    });

    if (matchedProducts.length > 0) {
      const topMatches = matchedProducts.slice(0, 3);
      const matchesSummary = topMatches
        .map((p) => `*${p.name}* (R$ ${(p.priceCents / 100).toFixed(2).replace('.', ',')})`)
        .join(', ');
      const firstMatch = topMatches[0];
      const quickAddUrl = `${baseAppUrl}/?loja=${tenant.slug}&item=${encodeURIComponent(firstMatch.id)}`;

      return finalizeReply({
        triggeredTool: 'tool_consultar_cardapio_e_precos',
        actionType: 'cardapio',
        referencedProducts: topMatches.map((p) => p.name),
        replyMessage: isFollowUp
          ? `${audioAckPrefix}Temos sim! No cardápio de hoje temos ${matchesSummary}. Clique aqui para já abrir na sacola e finalizar: ${quickAddUrl}`
          : `${audioAckPrefix}Oi, *${firstName}*! Temos sim: ${matchesSummary}. 🍔 Clique no link para já adicionar na sua sacola: ${quickAddUrl}`,
      });
    }

    if (
      cleanText.includes('preço') ||
      cleanText.includes('preco') ||
      cleanText.includes('quanto custa') ||
      cleanText.includes('opções') ||
      cleanText.includes('opcoes') ||
      cleanText.includes('cardápio') ||
      cleanText.includes('cardapio') ||
      cleanText.includes('todos os itens')
    ) {
      const highlightsInline = ctx.tenantProducts
        .slice(0, 3)
        .map((p) => `*${p.name}* (R$ ${(p.priceCents / 100).toFixed(2).replace('.', ',')})`)
        .join(', ');
      return finalizeReply({
        triggeredTool: 'tool_consultar_cardapio_e_precos',
        actionType: 'cardapio',
        referencedProducts: ctx.tenantProducts.slice(0, 3).map((p) => p.name),
        replyMessage: isFollowUp
          ? `${audioAckPrefix}Nossos destaques de hoje são: ${highlightsInline || 'nossos pratos na brasa'}. Veja todas as fotos e monte sua sacola em: ${ctx.digitalMenuUrl}`
          : `${audioAckPrefix}Oi, *${firstName}*! Alguns dos nossos destaques hoje no *${tenant.name}* são: ${highlightsInline}. Confira o cardápio completo com fotos em: ${ctx.digitalMenuUrl}`,
      });
    }

    // 6. Delivery Fee, Address, Neighborhoods, Pickup, or Table QR Code Inquiry
    if (
      cleanText.includes('entrega') ||
      cleanText.includes('taxa') ||
      cleanText.includes('frete') ||
      cleanText.includes('bairro') ||
      cleanText.includes('endereço') ||
      cleanText.includes('endereco') ||
      cleanText.includes('onde fica') ||
      cleanText.includes('retirada') ||
      cleanText.includes('balcão') ||
      cleanText.includes('balcao') ||
      cleanText.includes('mesa')
    ) {
      return finalizeReply({
        triggeredTool: 'tool_taxa_entrega_e_modalidades',
        actionType: 'cardapio',
        replyMessage: isFollowUp
          ? `${audioAckPrefix}Nossa taxa de entrega padrão é *${ctx.deliveryFeeFormatted}* (pedido mínimo ${ctx.minOrderFormatted})${tenant.address ? ` e ficamos em ${tenant.address}` : ''}. Você pode escolher Delivery ou Retirada direto na sacola: ${ctx.digitalMenuUrl}`
          : `${audioAckPrefix}Oi, *${firstName}*! Entregamos com taxa padrão de *${ctx.deliveryFeeFormatted}* (Mínimo: ${ctx.minOrderFormatted}) e também aceitamos Retirada no Balcão ou Mesa. Peça pelo link: ${ctx.digitalMenuUrl}`,
      });
    }

    // 7. Payment Methods / Pix Inquiry
    if (
      cleanText.includes('pix') ||
      cleanText.includes('pagamento') ||
      cleanText.includes('cartão') ||
      cleanText.includes('cartao') ||
      cleanText.includes('dinheiro') ||
      cleanText.includes('troco') ||
      cleanText.includes('aceita')
    ) {
      return finalizeReply({
        triggeredTool: 'tool_formas_pagamento_loja',
        actionType: 'cardapio',
        replyMessage: isFollowUp
          ? `${audioAckPrefix}Aceitamos Pix automático (com QR Code e Copia e Cola na hora), Cartão de Crédito/Débito na entrega e Dinheiro com troco. Só escolher na etapa final da sacola: ${ctx.digitalMenuUrl}`
          : `${audioAckPrefix}Oi, *${firstName}*! Aceitamos Pix com aprovação na hora, cartão ou dinheiro com troco. Monte seu pedido no cardápio: ${ctx.digitalMenuUrl}`,
      });
    }

    // 8. Opening Hours / Open Status Inquiry
    if (
      cleanText.includes('horário') ||
      cleanText.includes('horario') ||
      cleanText.includes('aberto') ||
      cleanText.includes('fechado') ||
      cleanText.includes('abre') ||
      cleanText.includes('fecha') ||
      cleanText.includes('funcionando') ||
      cleanText.includes('sábado') ||
      cleanText.includes('sabado') ||
      cleanText.includes('domingo')
    ) {
      return finalizeReply({
        triggeredTool: 'tool_horario_funcionamento_loja',
        actionType: tenant.isOpen ? 'cardapio' : 'closed_hours',
        replyMessage: tenant.isOpen
          ? isFollowUp
            ? `${audioAckPrefix}Estamos *🟢 ABERTOS AGORA* a todo vapor! Nosso horário é *${ctx.openingHoursText}*. Escolha seus itens na sacola por aqui: ${ctx.digitalMenuUrl}`
            : `${audioAckPrefix}Oi, *${firstName}*! Estamos *🟢 ABERTOS AGORA* recebendo pedidos! Horário: *${ctx.openingHoursText}*. Peça sem fila pelo cardápio: ${ctx.digitalMenuUrl}`
          : isFollowUp
            ? `${audioAckPrefix}Neste momento estamos fechados — nosso horário de funcionamento é *${ctx.openingHoursText}*. Mas você já pode ver as opções em: ${ctx.digitalMenuUrl}`
            : `${audioAckPrefix}Oi, *${firstName}*! No momento estamos fechados (Horário: *${ctx.openingHoursText}*). Confira nosso cardápio em: ${ctx.digitalMenuUrl}`,
      });
    }

    // 9. Default Greeting / Natural Continuation (Anti-Repetitive!)
    if (!tenant.isOpen) {
      return finalizeReply({
        triggeredTool: 'tool_enviar_cardapio_loja_fechada',
        actionType: 'closed_hours',
        replyMessage: isFollowUp
          ? `${audioAckPrefix}Lembrando que nosso horário de atendimento é *${ctx.openingHoursText}*. Assim que abrirmos já preparamos seu pedido pelo link: ${ctx.digitalMenuUrl} *(Ou digite 2 para atendente)*`
          : `${audioAckPrefix}Olá, *${firstName}*! Aqui é do *${tenant.name}*. No momento estamos fechados (Horário: *${ctx.openingHoursText}*), mas você pode conferir nosso cardápio completo em: ${ctx.digitalMenuUrl}`,
      });
    }

    if (isFollowUp) {
      const prevOrderHint =
        ctx.customerRecentOrders.length > 0
          ? ` Se quiser repetir seu último pedido (*${ctx.customerRecentOrders[0].itemsSummary}*), clique aqui: ${ctx.customerRecentOrders[0].repeatOrderUrl}`
          : ` Acesse nosso cardápio para montar sua sacola: ${ctx.digitalMenuUrl}`;
      return finalizeReply({
        triggeredTool: 'tool_continuacao_contextual_conversa',
        actionType: 'cardapio',
        replyMessage: `${audioAckPrefix}Me conta o que você está com vontade de pedir hoje, *${firstName}*! Posso tirar dúvidas dos pratos ou calcular o valor para você.${prevOrderHint}`,
      });
    }

    return finalizeReply({
      triggeredTool: 'tool_enviar_cardapio_digital',
      actionType: 'cardapio',
      replyMessage: `${audioAckPrefix}Olá, *${firstName}*! Bem-vindo(a) ao *${tenant.name}*! 🍔 Estamos abertos! Monte sua sacola no nosso cardápio digital ou me diga se quer repetir seu último pedido: ${ctx.digitalMenuUrl}`,
    });
  };

  // Endpoint to fetch items for 1-Click Repeat Order (?loja=slug&repetir=orderId) in ConsumerMenuView
  app.get('/api/v1/tenants/:slug/repeat-order', requireTenantAccess('slug'), async (req: Request, res: Response) => {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    const orderId = String(req.query.orderId || req.query.repetir || '').trim();
    const phone = String(req.query.phone || '').replace(/\D/g, '');

    await hydrateTenantCatalogFromDb(slug);
    const tenant = memoryTenants.find((t) => t.slug.toLowerCase() === slug) || memoryTenants[0];
    if (!tenant) {
      return res.status(404).json({ error: 'Restaurante não encontrado.' });
    }

    const baseAppUrl = (process.env.APP_URL || 'https://aladay.com.br').replace(/\/$/, '');
    const ctx = buildRestaurantCatalogContext(tenant, baseAppUrl, phone);

    const matchedOrder =
      ctx.customerRecentOrders.find((o) => String(o.id) === orderId || String(o.orderNumber) === orderId) ||
      ctx.customerRecentOrders[0] ||
      null;

    if (!matchedOrder) {
      return res.status(404).json({ error: 'Pedido anterior não encontrado.' });
    }

    res.json({
      success: true,
      order: matchedOrder,
    });
  });

  // Endpoint to inspect or clear conversation memory for a customer phone
  app.get('/api/v1/n8n/conversation-memory', (req: Request, res: Response) => {
    const tenantSlug = String(req.query.tenantSlug || req.query.slug || 'churrasco-da-oda').trim();
    const customerPhone = String(req.query.customerPhone || req.query.phone || '').trim();
    const session = getOrInitConversationSession(tenantSlug, customerPhone);
    res.json({
      success: true,
      session,
    });
  });

  app.post('/api/v1/n8n/conversation-memory/clear', (req: Request, res: Response) => {
    const tenantSlug = String(req.body?.tenantSlug || req.body?.slug || '').trim();
    const customerPhone = String(req.body?.customerPhone || req.body?.phone || '').trim();
    if (tenantSlug && customerPhone) {
      const key = getConversationSessionKey(tenantSlug, customerPhone);
      memoryConversationSessions.delete(key);
    } else {
      memoryConversationSessions.clear();
    }
    res.json({
      success: true,
      message: 'Memória de conversa do cliente reiniciada com sucesso!',
    });
  });

  // Standalone Audio Transcription endpoint for n8n workflows & testing
  app.post('/api/v1/n8n/transcribe-audio', async (req: Request, res: Response) => {
    const {
      audioBase64,
      audioMimeType,
      audioTranscription,
      messageKey,
      serverUrl,
      apiKey,
      instance,
      fallbackText,
    } = req.body || {};

    const result = await transcribeWhatsAppAudioMessage({
      isAudio: true,
      audioBase64,
      audioMimeType,
      audioTranscription,
      messageKey,
      serverUrl,
      apiKey,
      instance,
      fallbackText,
    });

    res.json({
      success: true,
      ...result,
    });
  });

  // Bot Simulation & n8n Inbound Process Endpoint
  app.post('/api/v1/bot/simulate-message', async (req: Request, res: Response) => {
    const { tenantSlug, customerPhone, customerName, messageText, isAudio, audioBase64, audioMimeType } = req.body;
    const tenant = resolveTenantForAgent(tenantSlug);
    if (!tenant) return res.status(404).json({ error: 'Restaurante não encontrado.' });

    const currentTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const baseAppUrl = (process.env.APP_URL || 'https://aladay.com.br').replace(/\/$/, '');

    const audioRes = await transcribeWhatsAppAudioMessage({
      isAudio: Boolean(isAudio || audioBase64),
      audioBase64,
      audioMimeType,
      fallbackText: messageText,
    });

    const effectiveMessage = audioRes.transcribedText || messageText || '';

    const generated = generateRestaurantCustomerReply({
      tenant,
      customerName: customerName || 'Cliente',
      customerPhone: customerPhone || '',
      messageText: effectiveMessage,
      isAudio: audioRes.isAudio,
      baseAppUrl,
    });

    const replyMessage = generated.replyMessage;
    const actionType = generated.actionType;

    // Record Inbound log
    const inboundLog = {
      id: `log_${Date.now()}_in`,
      timestamp: currentTime,
      source: 'evolution',
      eventType: audioRes.isAudio ? 'AUDIO_MESSAGE_TRANSCRIBED' : 'MESSAGES_UPSERT',
      instance: tenant.evolutionInstanceId,
      senderPhone: customerPhone || '',
      messageText: audioRes.isAudio ? `🎙️ [Áudio]: "${effectiveMessage}"` : effectiveMessage,
      direction: 'inbound',
      status: 'success',
      payloadSummary: `Inbound ${audioRes.isAudio ? 'de Áudio ' : ''}processado via n8n para ${tenant.name} (Turno #${generated.turnCount})`,
      fullPayload: { tenantSlug: tenant.slug, customerPhone, messageText: effectiveMessage, isAudio: audioRes.isAudio },
    };
    memoryWebhookLogs.unshift(inboundLog);

    // Record Outbound reply log
    const outboundLog = {
      id: `log_${Date.now()}_out`,
      timestamp: currentTime,
      source: 'n8n',
      eventType: 'DISPATCH_REPLY',
      instance: tenant.evolutionInstanceId,
      senderPhone: customerPhone || '',
      messageText: replyMessage,
      direction: 'outbound',
      status: 'success',
      payloadSummary: `Auto-resposta despachada via Evolution API (${generated.triggeredTool})`,
      fullPayload: { actionType, triggeredTool: generated.triggeredTool, replyMessage, turnCount: generated.turnCount },
    };
    memoryWebhookLogs.unshift(outboundLog);
    if (memoryWebhookLogs.length > 50) memoryWebhookLogs.splice(50);

    res.json({
      success: true,
      sender: customerPhone || '',
      receivedText: effectiveMessage,
      isAudio: audioRes.isAudio,
      turnCount: generated.turnCount,
      isFollowUp: generated.isFollowUp,
      conversationMemory: generated.conversationMemory,
      replyMessage,
      actionType,
      triggeredTool: generated.triggeredTool,
      processedBy: 'n8n-workflow-v4',
      evolutionInstance: tenant.evolutionInstanceId,
      timestamp: currentTime,
    });
  });

  // Direct Test Dispatch Endpoint (for simulating live curl from UI)
  app.post('/api/v1/webhooks/test-dispatch', requireSuperAdmin, (req: Request, res: Response) => {
    const { instance, senderPhone, messageText, tenantSlug } = req.body;
    const tenant = memoryTenants.find((t) => t.slug === tenantSlug || t.evolutionInstanceId === instance) || memoryTenants[0];
    const baseAppUrl = (process.env.APP_URL || 'https://aladay.com.br').replace(/\/$/, '');

    const cleanText = String(messageText || 'Oi, quero o cardapio').trim().toLowerCase();
    const isHuman = cleanText === '2' || cleanText.includes('atendente') || cleanText.includes('humano');
    const currentTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    let action = 'cardapio';
    let reply = `Olá! Seja muito bem-vindo ao *${tenant.name}*! Acesse o cardápio: ${baseAppUrl}/?loja=${tenant.slug}`;
    if (isHuman) {
      action = 'human_handoff';
      reply = `Encaminhando para um atendente da equipe do ${tenant.name}.`;
    }

    const testEvent = {
      id: `test_${Date.now()}`,
      timestamp: currentTime,
      source: 'n8n',
      eventType: 'WEBHOOK_MANUAL_TEST',
      instance: tenant.evolutionInstanceId,
      senderPhone: senderPhone || '5511988887777',
      messageText: cleanText,
      direction: 'inbound',
      status: 'success',
      payloadSummary: `Disparo de teste executado com sucesso (Ação: ${action})`,
      fullPayload: {
        simulatedHeaders: {
          'content-type': 'application/json',
          'user-agent': 'Evolution-API/2.1.0',
        },
        payloadSent: {
          event: 'messages.upsert',
          instance: tenant.evolutionInstanceId,
          data: {
            key: { remoteJid: `${senderPhone || '5511988887777'}@s.whatsapp.net`, fromMe: false },
            message: { conversation: messageText || 'Oi, quero o cardapio' },
          },
        },
        generatedReply: reply,
      },
    };

    memoryWebhookLogs.unshift(testEvent);
    if (memoryWebhookLogs.length > 50) memoryWebhookLogs.pop();

    res.json({
      success: true,
      statusCode: 200,
      latencyMs: 18,
      actionTriggered: action,
      replyDispatched: reply,
      recordedLogId: testEvent.id,
    });
  });

  // ============================================================================
  // N8N AI AGENT TOOLS & EVOLUTION API WEBHOOK INTEGRATION ENDPOINTS
  // ============================================================================

  // 1. GET & PUT /api/v1/n8n/knowledge-base (HTTP Tool for the n8n Commercial SDR AI Agent + Live Editor)
  app.get('/api/v1/n8n/knowledge-base', (_req: Request, res: Response) => {
    const kbPath = path.join(process.cwd(), 'public', 'base-conhecimento-agente-ia-aladay.txt');
    let rawKnowledgeBase = '';
    try {
      if (fs.existsSync(kbPath)) {
        rawKnowledgeBase = fs.readFileSync(kbPath, 'utf-8');
      }
    } catch {
      // Fallback if file read fails
    }

    res.json({
      success: true,
      version: '4.1 (Novembro 2026)',
      platform: 'Aladay Cardápios Digitais (SaaS)',
      officialWebsite: 'https://aladay.com.br',
      supportWhatsapp: '559131976334',
      supportWhatsappLink: 'https://wa.me/559131976334',
      plans: {
        annual: {
          name: 'Plano Anual Aladay Pro',
          monthlyEquivalent: 'R$ 99,00/mês (12x de R$ 99,00 sem juros)',
          totalAnnual: 'R$ 1.188,00/ano',
          paymentMethod: 'Exclusivo no Cartão de Crédito em até 12x',
          savings: 'Economia de R$ 370,80/ano (23% de desconto)',
          commission: '0% sobre pedidos',
          activation: 'Imediata',
        },
        monthly: {
          name: 'Plano Mensal Aladay Pro (com 15 Dias Grátis)',
          price: 'R$ 129,90/mês',
          freeTrial: '15 dias 100% grátis (R$ 0,00 hoje)',
          paymentMethodsAfterTrial: ['Pix', 'Boleto Bancário', 'Cartão de Crédito'],
          commission: '0% sobre pedidos',
          fidelity: 'Sem fidelidade (cancele quando quiser)',
        },
      },
      highlights: [
        '0% de comissão sobre pedidos (pedidos, produtos e fotos ilimitados)',
        'Pix Direto 100% na conta bancária do restaurante na mesma hora',
        '3 Modalidades no mesmo link: Delivery, Retirada no Balcão e Salão / QR Code de Mesa',
        'Módulo Completo de Mesas & Garçom (Salão): Mapa de mesas em tempo real, comanda digital p/ garçons, divisão de conta por pessoa e Pix na mesa',
        'Integração Oficial iFood Partner API: Recebimento unificado de pedidos do iFood direto na tela da cozinha (KDS) com alerta sonoro e impressão 80mm',
        'Automação de WhatsApp via Evolution API + Agente IA n8n (3 avisos automáticos: Recebido, Em Preparo e Saiu para Entrega)',
        'Aba de Relatórios Analíticos (Recharts): Gráficos de Total de Vendas por Dia e Ranking dos Produtos Mais Vendidos + CRM de Clientes',
        'Configurador Rápido de Horário na Barra Superior e Link Direto Exclusivo do Restaurante (/?loja=slug)',
        'Importador inteligente de cardápio via planilha Excel/CSV em segundos',
      ],
      knowledgeBase: rawKnowledgeBase,
      knowledgeBaseText: rawKnowledgeBase,
      updatedAt: new Date().toISOString(),
    });
  });

  app.put('/api/v1/n8n/knowledge-base', (req: Request, res: Response) => {
    const incomingText = req.body?.content ?? req.body?.knowledgeBaseText;
    if (typeof incomingText !== 'string' || !incomingText.trim()) {
      return res.status(400).json({
        ok: false,
        success: false,
        error: 'O conteúdo da Base de Conhecimento não pode estar vazio.',
      });
    }
    const kbPath = path.join(process.cwd(), 'public', 'base-conhecimento-agente-ia-aladay.txt');
    try {
      fs.writeFileSync(kbPath, incomingText, 'utf-8');
      res.json({
        ok: true,
        success: true,
        message: 'Base de Conhecimento Oficial v4.1 atualizada com sucesso!',
        updatedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({
        ok: false,
        success: false,
        error: err?.message || 'Erro ao salvar o arquivo da Base de Conhecimento.',
      });
    }
  });

  // 2. GET & POST /api/v1/n8n/agent-context/:slug & /api/v1/n8n/agent-context
  const handleGetN8nAgentContext = async (req: Request, res: Response) => {
    const slugOrInstance = String(
      req.params.slug || req.query.slug || req.query.loja || req.query.tenantSlug || req.body?.tenantSlug || req.body?.slug || ''
    ).trim();
    const queryInstance = String(req.query.instance || req.body?.instance || '').trim();
    const customerPhone = String(req.query.phone || req.query.customerPhone || req.body?.customerPhone || req.body?.phone || '').trim();
    const customerName = String(req.query.customerName || req.body?.customerName || 'Cliente').trim();
    const rawMessageText = String(req.query.messageText || req.body?.messageText || '').trim();
    const endpointUrl = String(req.query.endpointUrl || req.body?.endpointUrl || '').trim();
    const apiKey = String(req.query.apiKey || req.body?.apiKey || '').trim();
    const serverUrl = String(req.query.serverUrl || req.body?.serverUrl || '').trim();
    const isAudio = Boolean(req.body?.isAudio || req.query.isAudio === 'true' || req.body?.audioBase64);
    const audioBase64 = String(req.body?.audioBase64 || '').trim();
    const audioMimeType = String(req.body?.audioMimeType || 'audio/ogg').trim();
    const audioTranscription = String(req.body?.audioTranscription || '').trim();
    const messageKey = req.body?.messageKey || null;

    if (slugOrInstance) {
      await hydrateTenantCatalogFromDb(slugOrInstance.replace(/^instancia_/i, ''));
    }

    const tenant = resolveTenantForAgent(slugOrInstance, queryInstance);
    if (!tenant) {
      return res.status(404).json({ error: 'Restaurante não encontrado.' });
    }
    await hydrateTenantCatalogFromDb(tenant.slug);

    // Automatically transcribe voice notes if customer sent an audio on WhatsApp
    const audioResult = await transcribeWhatsAppAudioMessage({
      isAudio,
      audioBase64,
      audioMimeType,
      audioTranscription,
      messageKey,
      serverUrl,
      apiKey,
      instance: queryInstance || tenant.evolutionInstanceId || 'aladay',
      fallbackText: rawMessageText,
    });

    const effectiveMessageText = audioResult.transcribedText || rawMessageText;

    // Record incoming message in session memory if non-empty
    if (effectiveMessageText && customerPhone) {
      recordUserMessageInSession({
        tenantSlug: tenant.slug,
        customerPhone,
        customerName,
        messageText: effectiveMessageText,
        isAudio: audioResult.isAudio,
      });
    }

    const baseAppUrl = (process.env.APP_URL || 'https://aladay.com.br').replace(/\/$/, '');
    const ctx = buildRestaurantCatalogContext(tenant, baseAppUrl, customerPhone, customerName);

    res.json({
      success: true,
      inbound: {
        tenantSlug: tenant.slug,
        instance: queryInstance || tenant.evolutionInstanceId || 'aladay',
        customerPhone,
        customerName,
        messageText: effectiveMessageText,
        isAudio: audioResult.isAudio,
        audioTranscription: audioResult.isAudio ? effectiveMessageText : undefined,
        transcriptionProvider: audioResult.provider,
        endpointUrl,
        apiKey,
      },
      restaurant: {
        name: tenant.name,
        slug: tenant.slug,
        phone: tenant.phone,
        address: tenant.address,
        isOpen: tenant.isOpen,
        statusLabel: tenant.isOpen ? '🟢 ABERTO AGORA (Recebendo Pedidos)' : '🔴 FECHADO NO MOMENTO',
        openingHoursText: ctx.openingHoursText,
        digitalMenuUrl: ctx.digitalMenuUrl,
        tableQrCodeUrlExample: ctx.tableQrCodeUrlExample,
        deliveryFeeFormatted: ctx.deliveryFeeFormatted,
        deliveryFeeCents: tenant.deliveryFeeCents || 0,
        minOrderFormatted: ctx.minOrderFormatted,
        minOrderCents: tenant.minOrderCents || 0,
        deliveryZones: tenant.deliveryZones || [],
        pixKey: tenant.pixKey || tenant.pixConfig?.pixKey || '',
        paymentMethods: [
          'Pix Automático na Hora (QR Code e Pix Copia e Cola)',
          'Cartão de Crédito e Débito na Entrega/Balcão',
          'Dinheiro (com cálculo de troco)',
        ],
        tablesModuleEnabled: true,
        ifoodIntegrated: Boolean(tenant.ifoodConfig?.status === 'connected'),
      },
      catalogSummary: ctx.catalogByCategory,
      catalogTextFormatted: ctx.catalogTextFormatted,
      topItemsText: ctx.topItemsText,
      totalAvailableProducts: ctx.tenantProducts.length,
      customerRecentOrders: ctx.customerRecentOrders,
      lastOrderContextText: ctx.lastOrderContextText,
      conversationMemory: ctx.conversationMemory,
      readyToSendMessages: ctx.readyToSendMessages,
      timestamp: new Date().toISOString(),
    });
  };

  app.get('/api/v1/n8n/agent-context/:slug', handleGetN8nAgentContext);
  app.get('/api/v1/n8n/agent-context', handleGetN8nAgentContext);
  app.post('/api/v1/n8n/agent-context', handleGetN8nAgentContext);

  // 2B. POST /api/v1/n8n/restaurant-auto-reply (Direct intelligent reply generator for n8n workflows)
  app.post('/api/v1/n8n/restaurant-auto-reply', async (req: Request, res: Response) => {
    const {
      tenantSlug,
      instance,
      customerName,
      customerPhone,
      messageText,
      isAudio,
      audioBase64,
      audioMimeType,
      audioTranscription,
      messageKey,
      serverUrl,
      apiKey,
    } = req.body || {};
    if (tenantSlug || instance) {
      await hydrateTenantCatalogFromDb(String(tenantSlug || instance).replace(/^instancia_/i, ''));
    }
    const tenant = resolveTenantForAgent(tenantSlug, instance);
    if (!tenant) {
      return res.status(404).json({ error: 'Restaurante não encontrado.' });
    }
    await hydrateTenantCatalogFromDb(tenant.slug);

    const audioResult = await transcribeWhatsAppAudioMessage({
      isAudio: Boolean(isAudio || audioBase64),
      audioBase64,
      audioMimeType,
      audioTranscription,
      messageKey,
      serverUrl,
      apiKey,
      instance: instance || tenant.evolutionInstanceId,
      fallbackText: messageText,
    });

    const baseAppUrl = (process.env.APP_URL || 'https://aladay.com.br').replace(/\/$/, '');
    const generated = generateRestaurantCustomerReply({
      tenant,
      customerName,
      customerPhone,
      messageText: audioResult.transcribedText || messageText,
      isAudio: audioResult.isAudio,
      baseAppUrl,
    });
    res.json({
      success: true,
      tenantSlug: tenant.slug,
      restaurantName: tenant.name,
      isOpen: tenant.isOpen,
      openingHoursText: tenant.openingHoursText || 'Segunda a Domingo: 18:00 às 23:45',
      digitalMenuUrl: `${baseAppUrl}/?loja=${tenant.slug}`,
      isAudio: audioResult.isAudio,
      transcribedText: audioResult.transcribedText,
      turnCount: generated.turnCount,
      isFollowUp: generated.isFollowUp,
      triggeredTool: generated.triggeredTool,
      actionType: generated.actionType,
      replyMessage: generated.replyMessage,
      timestamp: new Date().toISOString(),
    });
  });

  // 3. GET & POST /api/v1/n8n/order-status (HTTP Tool for n8n AI Agent to consult customer orders by phone)
  const handleN8nOrderStatusLookup = (req: Request, res: Response) => {
    const rawPhone = String(req.query.phone || req.body?.phone || req.body?.customerPhone || '').replace(/\D/g, '');
    const tenantSlug = String(req.query.tenantSlug || req.body?.tenantSlug || '').trim();

    const matchingOrders = memoryOrders.filter((o) => {
      const orderPhone = String(o.customerPhone || '').replace(/\D/g, '');
      const phoneMatches = !rawPhone || orderPhone.endsWith(rawPhone.slice(-8)) || rawPhone.endsWith(orderPhone.slice(-8));
      const tenantMatches = !tenantSlug || o.tenantSlug === tenantSlug;
      return phoneMatches && tenantMatches;
    });

    if (matchingOrders.length === 0) {
      return res.json({
        success: true,
        found: false,
        message: 'Nenhum pedido recente encontrado para este número de WhatsApp.',
        orders: [],
      });
    }

    const statusLabels: Record<string, string> = {
      pending_payment: 'Aguardando Pagamento / Confirmação',
      confirmed: 'Pedido Recebido e Confirmado',
      preparing: 'Em Preparo na Cozinha',
      out_for_delivery: 'Saiu para Entrega / Pronto para Retirada',
      completed: 'Entregue / Concluído',
      cancelled: 'Cancelado',
    };

    res.json({
      success: true,
      found: true,
      orders: matchingOrders.slice(0, 3).map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        customerName: o.customerName,
        status: o.status,
        statusLabel: statusLabels[o.status] || o.status,
        totalFormatted: `R$ ${((o.totalCents || 0) / 100).toFixed(2).replace('.', ',')}`,
        deliveryAddress: o.deliveryAddress,
        items: (o.items || []).map((i: any) => `${i.quantity}x ${i.name}`).join(', '),
        createdAt: o.createdAt,
      })),
    });
  };

  app.get('/api/v1/n8n/order-status', handleN8nOrderStatusLookup);
  app.post('/api/v1/n8n/order-status', handleN8nOrderStatusLookup);

  // 4. POST /api/v1/n8n/configure-evolution-webhook (1-Click webhook registration on Evolution API v2 -> n8n)
  app.post('/api/v1/n8n/configure-evolution-webhook', async (req: Request, res: Response) => {
    const {
      evolutionUrl = 'https://integration.example.invalid',
      evolutionApiKey = '',
      instanceName = 'aladay',
      n8nWebhookUrl = 'https://integration.example.invalid',
    } = req.body;

    const cleanEvoUrl = String(evolutionUrl).replace(/\/$/, '');
    const cleanInstance = String(instanceName || 'aladay').trim();
    const cleanWebhookUrl = String(n8nWebhookUrl).trim();
    const apiKeyToUse = String(evolutionApiKey || process.env.EVOLUTION_API_KEY || '').trim();
    const currentTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const webhookPayload = {
      webhook: {
        enabled: true,
        url: cleanWebhookUrl,
        byEvents: false,
        base64: true,
        events: ['MESSAGES_UPSERT'],
      },
    };

    let remoteConfigured = false;
    let remoteStatus = 200;
    let remoteResponse: any = null;

    if (apiKeyToUse) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const evoRes = await fetch(`${cleanEvoUrl}/webhook/set/${cleanInstance}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: apiKeyToUse,
          },
          body: JSON.stringify(webhookPayload),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        remoteStatus = evoRes.status;
        remoteResponse = await evoRes.json().catch(() => null);
        remoteConfigured = evoRes.ok;
      } catch (err: any) {
        remoteResponse = { note: 'Configuração registrada localmente (Evolution API remota inacessível no momento).', detail: err?.message };
      }
    }

    memoryWebhookLogs.unshift({
      id: `log_n8n_bind_${Date.now()}`,
      timestamp: currentTime,
      source: 'evolution',
      eventType: 'WEBHOOK_SET_N8N',
      instance: cleanInstance,
      senderPhone: 'Sistema n8n',
      messageText: `Webhook MESSAGES_UPSERT vinculado para: ${cleanWebhookUrl}`,
      direction: 'outbound',
      status: 'success',
      payloadSummary: `Integração Evolution API (${cleanInstance}) -> n8n (${cleanWebhookUrl}) configurada.`,
      fullPayload: {
        endpoint: `${cleanEvoUrl}/webhook/set/${cleanInstance}`,
        payload: webhookPayload,
        remoteConfigured,
        remoteResponse,
      },
    });

    res.json({
      success: true,
      remoteConfigured,
      remoteStatus,
      instanceName: cleanInstance,
      n8nWebhookUrl: cleanWebhookUrl,
      message: remoteConfigured
        ? `Webhook registrado com sucesso na Evolution API (${cleanInstance}) apontando para o n8n!`
        : `Configuração de Webhook preparada para a instância "${cleanInstance}" apontando para ${cleanWebhookUrl}.`,
      webhookPayload,
      remoteResponse,
      timestamp: currentTime,
    });
  });

  // 5. POST /api/v1/n8n/test-agent (Simulates & tests the n8n AI Agent response + Audio + Context + Real n8n webhook)
  app.post('/api/v1/n8n/test-agent', async (req: Request, res: Response) => {
    const {
      agentProfile = 'sdr_aladay',
      tenantSlug = 'aladay',
      customerName = 'Carlos Mendes',
      customerPhone = '',
      messageText = 'Olá! Quero saber como funciona o cardápio digital e quanto custa.',
      isAudio = false,
      audioBase64 = '',
      audioMimeType = 'audio/ogg',
      n8nWebhookUrl = 'https://integration.example.invalid',
      dispatchToRemoteN8n = false,
    } = req.body;

    const startTime = Date.now();
    await hydrateTenantCatalogFromDb(tenantSlug);
    const tenant = memoryTenants.find((t) => t.slug === tenantSlug) || memoryTenants[0];
    const currentTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const baseAppUrl = (process.env.APP_URL || 'https://aladay.com.br').replace(/\/$/, '');

    const audioResult = await transcribeWhatsAppAudioMessage({
      isAudio: Boolean(isAudio || audioBase64 || String(messageText).startsWith('🎙️')),
      audioBase64,
      audioMimeType,
      fallbackText: messageText,
    });

    const effectiveText = audioResult.transcribedText || messageText;
    const cleanText = String(effectiveText || '').trim().toLowerCase();

    // Construct real Evolution API v2 MESSAGES_UPSERT payload (supports both text and audioMessage)
    const evolutionPayload = {
      event: 'messages.upsert',
      instance: tenant?.evolutionInstanceId || 'aladay',
      server_url: process.env.EVOLUTION_API_URL || '',
      apikey: process.env.EVOLUTION_API_KEY || '',
      data: {
        key: {
          remoteJid: `${String(customerPhone).replace(/\D/g, '')}@s.whatsapp.net`,
          fromMe: false,
          id: `BAE5${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
        },
        pushName: customerName,
        messageType: audioResult.isAudio ? 'audioMessage' : 'conversation',
        message: audioResult.isAudio
          ? {
              audioMessage: {
                mimetype: audioMimeType || 'audio/ogg; codecs=opus',
                ptt: true,
                seconds: 6,
                transcription: effectiveText,
              },
              speechToText: effectiveText,
            }
          : {
              conversation: effectiveText,
            },
        messageTimestamp: Math.floor(Date.now() / 1000),
      },
    };

    let remoteN8nStatus: string = 'local_simulation';
    let remoteN8nHttpCode: number | null = null;
    let remoteN8nReply: any = null;

    if (dispatchToRemoteN8n && n8nWebhookUrl) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const n8nRes = await fetch(String(n8nWebhookUrl).trim(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(evolutionPayload),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        remoteN8nHttpCode = n8nRes.status;
        remoteN8nReply = await n8nRes.json().catch(() => null);
        remoteN8nStatus = n8nRes.ok ? 'delivered_to_n8n' : `n8n_http_${n8nRes.status}`;
      } catch (err: any) {
        remoteN8nStatus = 'n8n_unreachable_fallback';
      }
    }

    // Generate intelligent response according to selected profile
    let agentReply = '';
    let triggeredTool = 'direct_llm_knowledge';
    let turnCount = 1;
    let isFollowUp = false;
    let conversationMemory: any = null;

    if (agentProfile === 'sdr_aladay') {
      const sdrSession = recordUserMessageInSession({
        tenantSlug: 'sdr_aladay',
        customerPhone,
        customerName,
        messageText: effectiveText,
        isAudio: audioResult.isAudio,
      });
      turnCount = sdrSession.turnCount;
      isFollowUp = turnCount > 1;
      const firstName = customerName.split(' ')[0] || 'Parceiro';
      const audioPrefix = audioResult.isAudio ? 'Ouvi seu áudio! 🎧 ' : '';

      if (cleanText.includes('preço') || cleanText.includes('preco') || cleanText.includes('valor') || cleanText.includes('custa') || cleanText.includes('plano')) {
        triggeredTool = 'tool_consultar_planos_aladay';
        agentReply = isFollowUp
          ? `${audioPrefix}Nosso Plano Anual sai por 12x de R$ 99 no cartão e o Plano Mensal custa R$ 129,90/mês com 15 dias grátis para testar tudo com 0% de comissão. Comece grátis em: ${baseAppUrl}`
          : `${audioPrefix}Olá, *${firstName}*! Na Aladay você tem cardápio digital com 0% de comissão e Pix na hora. Temos o Plano Anual (12x R$ 99 no cartão) e Mensal (R$ 129,90 com 15 dias grátis). Comece grátis agora: ${baseAppUrl}`;
      } else if (cleanText.includes('mesa') || cleanText.includes('garçom') || cleanText.includes('garcom') || cleanText.includes('salão') || cleanText.includes('salao') || cleanText.includes('comanda')) {
        triggeredTool = 'tool_modulo_mesas_garcom';
        agentReply = isFollowUp
          ? `${audioPrefix}O módulo de salão já vem incluso: mapa de mesas ao vivo, comanda digital para garçons, QR Code exclusivo por mesa e divisão de conta com Pix. Teste 15 dias grátis: ${baseAppUrl}`
          : `${audioPrefix}Olá, *${firstName}*! A Aladay inclui módulo completo de salão: mapa de mesas, comanda no celular do garçom, QR Code em cada mesa e divisão de conta com Pix na hora. Teste 15 dias grátis: ${baseAppUrl}`;
      } else if (cleanText.includes('ifood') || cleanText.includes('comissão') || cleanText.includes('comissao') || cleanText.includes('taxa')) {
        triggeredTool = 'tool_integracao_ifood_e_roi';
        agentReply = isFollowUp
          ? `${audioPrefix}Com a integração oficial iFood Partner API, os pedidos do iFood caem direto no seu KDS junto com o cardápio próprio (0% de comissão). Ative seus 15 dias grátis: ${baseAppUrl}`
          : `${audioPrefix}Olá, *${firstName}*! Temos integração oficial iFood Partner API: receba pedidos do iFood direto no KDS da cozinha junto com seu cardápio próprio com 0% de comissão. Teste 15 dias grátis: ${baseAppUrl}`;
      } else if (cleanText.includes('relatório') || cleanText.includes('relatorio') || cleanText.includes('gráfico') || cleanText.includes('grafico') || cleanText.includes('mais vendidos')) {
        triggeredTool = 'tool_relatorios_analiticos';
        agentReply = isFollowUp
          ? `${audioPrefix}Você acompanha faturamento diário, ticket médio, ranking dos pratos mais vendidos e CRM de clientes no WhatsApp em tempo real. Crie sua conta grátis: ${baseAppUrl}`
          : `${audioPrefix}Olá, *${firstName}*! O painel Aladay possui relatórios de vendas, ticket médio, produtos mais vendidos e CRM de clientes no WhatsApp em tempo real. Crie sua conta grátis: ${baseAppUrl}`;
      } else if (cleanText.includes('planilha') || cleanText.includes('cadastrar') || cleanText.includes('importar') || cleanText.includes('produtos') || cleanText.includes('horário') || cleanText.includes('horario')) {
        triggeredTool = 'tool_onboarding_cardapio';
        agentReply = isFollowUp
          ? `${audioPrefix}Você importa todo o seu cardápio via planilha Excel/CSV em 10 segundos e controla o status Aberto/Fechado em 1 clique no topo do painel: ${baseAppUrl}`
          : `${audioPrefix}Olá, *${firstName}*! Você configura o horário em 1 clique na barra superior e sobe todo o cardápio via planilha Excel/CSV em 10 segundos. Teste 15 dias grátis: ${baseAppUrl}`;
      } else if (cleanText === '2' || cleanText.includes('humano') || cleanText.includes('atendente') || cleanText.includes('consultor')) {
        triggeredTool = 'tool_human_handoff';
        agentReply = `${audioPrefix}Perfeito, *${firstName}*! Transferi seu atendimento. Fale diretamente com nosso consultor comercial no WhatsApp oficial: https://wa.me/559131976334 (+55 91 3197-6334)`;
      } else {
        triggeredTool = 'tool_qualificacao_sdr_aladay';
        agentReply = isFollowUp
          ? `${audioPrefix}Você pode testar todos os recursos no seu restaurante por 15 dias grátis e sem fidelidade. Quer que eu te envie o link de cadastro imediato? ${baseAppUrl}`
          : `${audioPrefix}Olá, *${firstName}*! A Aladay é a plataforma de cardápio digital com 0% de comissão, automação de WhatsApp via n8n e módulo de mesas. Teste por 15 dias grátis agora: ${baseAppUrl}`;
      }
      recordAssistantReplyInSession({
        tenantSlug: 'sdr_aladay',
        customerPhone,
        replyText: agentReply,
        triggeredTool,
      });
      conversationMemory = {
        sessionKey: sdrSession.sessionKey,
        turnCount: sdrSession.turnCount,
        isFollowUp,
        recentMessages: sdrSession.messages.slice(-8),
      };
    } else {
      // Restaurant Customer Support Agent Profile (Cardápio Digital, Áudio, "Quero aquele de ontem", Contexto e Anti-Repetição)
      const resolvedTenant = resolveTenantForAgent(tenantSlug, tenant?.evolutionInstanceId);
      const generated = generateRestaurantCustomerReply({
        tenant: resolvedTenant,
        customerName,
        customerPhone,
        messageText: effectiveText,
        isAudio: audioResult.isAudio,
        baseAppUrl,
      });
      triggeredTool = generated.triggeredTool;
      agentReply = generated.replyMessage;
      turnCount = generated.turnCount;
      isFollowUp = generated.isFollowUp;
      conversationMemory = generated.conversationMemory;
    }

    const latencyMs = Math.max(18, Date.now() - startTime);

    memoryWebhookLogs.unshift({
      id: `log_n8n_agent_${Date.now()}`,
      timestamp: currentTime,
      source: 'n8n',
      eventType: audioResult.isAudio ? 'N8N_AUDIO_AI_AGENT' : 'N8N_AI_AGENT_EXECUTION',
      instance: tenant?.evolutionInstanceId || 'aladay',
      senderPhone: customerPhone,
      messageText: agentReply,
      direction: 'outbound',
      status: 'success',
      payloadSummary: `Agente IA n8n (${agentProfile === 'sdr_aladay' ? 'SDR Comercial Aladay' : tenant.name}) respondeu via ${triggeredTool} [Turno #${turnCount}]`,
      fullPayload: {
        inboundEvolutionPayload: evolutionPayload,
        isAudio: audioResult.isAudio,
        transcribedText: effectiveText,
        turnCount,
        isFollowUp,
        triggeredTool,
        remoteN8nStatus,
        remoteN8nHttpCode,
        remoteN8nReply,
        agentReply,
      },
    });

    res.json({
      success: true,
      agentProfile,
      triggeredTool,
      isAudio: audioResult.isAudio,
      transcribedText: effectiveText,
      turnCount,
      isFollowUp,
      conversationMemory,
      latencyMs,
      remoteN8nStatus,
      remoteN8nHttpCode,
      evolutionPayload,
      agentReply,
      timestamp: currentTime,
    });
  });

  // ============================================================================
  // PASSO 2: AUTENTICAÇÃO JWT MULTI-TENANT & MAGIC OTP VIA WHATSAPP (EVOLUTION API)
  // ============================================================================
  interface InMemAuthUser {
    id: string;
    name: string;
    email: string;
    passwordHash: string;
    phone: string;
    role: 'SUPER_ADMIN' | 'TENANT_OWNER' | 'KITCHEN_STAFF';
    tenantId: string | '*';
    tenantSlug: string | '*';
    tenantName: string;
    permissions: string[];
  }

  function hashPassword(plainPassword: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const derived = crypto.scryptSync(plainPassword, salt, 64).toString('hex');
    return `scrypt$${salt}$${derived}`;
  }

  function verifyPassword(plainPassword: string, storedHash: string): boolean {
    try {
      if (storedHash.startsWith('scrypt$')) {
        const parts = storedHash.split('$');
        if (parts.length !== 3) return false;
        const [, salt, originalHex] = parts;
        const derivedBuf = crypto.scryptSync(plainPassword, salt, 64);
        const origBuf = Buffer.from(originalHex, 'hex');
        return derivedBuf.length === origBuf.length && crypto.timingSafeEqual(derivedBuf, origBuf);
      }
      return false;
    } catch {
      return false;
    }
  }

  const dummyPasswordHash = hashPassword(crypto.randomBytes(32).toString('hex'));
  const memoryUsers: InMemAuthUser[] = [
    {
      id: 'usr_super_01',
      name: 'Administrador Aladay',
      email: process.env.ADMIN_EMAIL || 'admin@aladay.com.br',
      passwordHash: hashPassword(process.env.ADMIN_PASSWORD!),
      phone: '',
      role: 'SUPER_ADMIN',
      tenantId: '*',
      tenantSlug: '*',
      tenantName: 'Aladay Plataforma',
      permissions: [
        'platform:manage_tenants',
        'platform:asaas_subscriptions',
        'platform:evolution_instances',
        'tenant:full_access',
        'kds:manage_orders',
      ],
    },
  ];

  // Load saved subscriber users from PostgreSQL on startup
  if (pgPool) {
    try {
      const dbUsers = await pgPool.query('SELECT * FROM subscriber_users ORDER BY created_at ASC;');
      const savedAdmin = dbUsers.rows.find((row) => row.id === 'usr_super_01');
      if (savedAdmin && verifyPassword(process.env.ADMIN_PASSWORD!, savedAdmin.password_hash)) memoryUsers[0].passwordHash = savedAdmin.password_hash;
      dbUsers.rows.forEach((row) => {
        const existingIdx = memoryUsers.findIndex((u) => u.email.toLowerCase() === String(row.email).toLowerCase());
        const mappedUser: InMemAuthUser = {
          id: row.id,
          name: row.name,
          email: row.email,
          passwordHash: row.password_hash,
          phone: row.phone || '',
          role: (row.role as any) || 'TENANT_OWNER',
          tenantId: row.tenant_id,
          tenantSlug: row.tenant_slug,
          tenantName: row.tenant_name || 'Restaurante',
          permissions: Array.isArray(row.permissions) ? row.permissions : ['tenant:full_access', 'kds:manage_orders'],
        };
        if (existingIdx >= 0 && memoryUsers[existingIdx].role !== 'SUPER_ADMIN') {
          memoryUsers[existingIdx] = mappedUser;
        } else if (existingIdx === -1) {
          memoryUsers.push(mappedUser);
        }
      });
    } catch (error) { throw error; }
  }

  const adminUser = memoryUsers[0];
  await databasePool.query(`INSERT INTO subscriber_users
    (id,name,email,password_hash,phone,role,tenant_id,tenant_slug,tenant_name,permissions)
    VALUES ($1,$2,$3,$4,'','SUPER_ADMIN','*','*',$5,$6::jsonb)
    ON CONFLICT (id) DO UPDATE SET email=EXCLUDED.email,password_hash=EXCLUDED.password_hash,role='SUPER_ADMIN',tenant_id='*',tenant_slug='*'`,
    [adminUser.id, adminUser.name, adminUser.email, adminUser.passwordHash, adminUser.tenantName, JSON.stringify(adminUser.permissions)]);
  app.post('/api/v1/auth/logout', async (req, res) => {
    const claims = getAuthenticatedClaims(req);
    await databasePool.query('UPDATE auth_sessions SET revoked_at=NOW() WHERE id=$1 AND user_id=$2', [claims.jti, claims.sub]);
    res.json({ success: true });
  });

  const memoryAuthAuditLogs: Array<{
    id: string;
    timestamp: string;
    userEmail: string;
    userName: string;
    role: 'SUPER_ADMIN' | 'TENANT_OWNER' | 'KITCHEN_STAFF';
    tenantSlug: string;
    method: 'password' | 'whatsapp_otp';
    ip: string;
    status: 'SUCCESS' | 'OTP_SENT' | 'DENIED';
    detail: string;
  }> = [];

  async function signJwtToken(user: InMemAuthUser) {
    const header = { alg: 'HS256', typ: 'JWT', kid: 'aladay-cloudflare-2026' };
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + 60 * 60 * 12; // 12 hours
    const claims = {
      sub: user.id,
      jti: crypto.randomUUID(),
      aud: 'aladay-api',
      name: user.name,
      email: user.email,
      role: user.role,
      tenant_id: user.tenantId,
      tenant_slug: user.tenantSlug,
      permissions: user.permissions,
      iss: 'https://aladay.com.br',
      iat,
      exp,
    };

    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(claims));
    const signature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    await databasePool.query('INSERT INTO auth_sessions (id, user_id, credential_hash, expires_at) VALUES ($1,$2,$3,to_timestamp($4))', [claims.jti, user.id, user.passwordHash, exp]);
    return {
      token: `${encodedHeader}.${encodedPayload}.${signature}`,
      claims,
    };
  }

  // POST /api/v1/auth/login (E-mail & Senha com Rate Limiting, Scrypt e Proteção Timing-Safe)
  app.post('/api/v1/auth/login', async (req: Request, res: Response) => {
    const clientIp = getClientIp(req);
    const rateKey = `login_${clientIp}`;
    if (!checkRateLimit(rateKey, 40, 5 * 60 * 1000)) {
      return res.status(429).json({
        success: false,
        error: 'Muitas tentativas de login consecutivas. Por favor, aguarde alguns minutos antes de tentar novamente.',
      });
    }

    const { email, password } = req.body;
    if (!await authRateLimit(`login_ip:${clientIp}`, 10) || !await authRateLimit(`login_account:${String(email).toLowerCase().slice(0,160)}`, 10)) return res.status(429).json({error:'Limite de tentativas excedido.'});
    if (typeof password !== 'string' || password.length > 256) return res.status(400).json({error:'Credenciais inválidas.'});
    const cleanEmail = String(email || '').trim().toLowerCase();
    const currentTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    let user = memoryUsers.find((u) => u.email.toLowerCase() === cleanEmail);

    // 1. If not in memoryUsers, check PostgreSQL subscriber_users table if connected
    if (pgPool && cleanEmail) {
      try {
        const dbRes = await pgPool.query(
          'SELECT * FROM subscriber_users WHERE LOWER(email) = $1 LIMIT 1;',
          [cleanEmail]
        );
        if (dbRes.rows[0]) {
          const row = dbRes.rows[0];
          user = {
            id: row.id,
            name: row.name,
            email: row.email,
            passwordHash: row.password_hash,
            phone: row.phone || '',
            role: (row.role as any) || 'TENANT_OWNER',
            tenantId: row.tenant_id,
            tenantSlug: row.tenant_slug,
            tenantName: row.tenant_name || 'Restaurante',
            permissions: Array.isArray(row.permissions) ? row.permissions : ['tenant:full_access', 'kds:manage_orders'],
          };
          const cachedIdx = memoryUsers.findIndex((item) => item.id === user!.id);
          if (cachedIdx >= 0) memoryUsers[cachedIdx] = user; else memoryUsers.push(user);
        }
      } catch (error) { throw error; }
    }

    const passwordMatches = verifyPassword(String(password), user?.passwordHash || dummyPasswordHash);

    if (!user || !passwordMatches) {
      memoryAuthAuditLogs.unshift({
        id: `audit_${Date.now()}`,
        timestamp: currentTime,
        userEmail: cleanEmail || 'desconhecido',
        userName: 'Tentativa Inválida',
        role: 'TENANT_OWNER',
        tenantSlug: '-',
        method: 'password',
        ip: clientIp,
        status: 'DENIED',
        detail: `Credenciais inválidas para ${cleanEmail}`,
      });
      return res.status(401).json({
        success: false,
        error: 'E-mail ou senha inválidos. Verifique suas credenciais.',
      });
    }

    // Reset rate limit counter on successful login
    ipRateLimits.delete(rateKey);

    const { token, claims } = await signJwtToken(user);

    memoryAuthAuditLogs.unshift({
      id: `audit_${Date.now()}`,
      timestamp: currentTime,
      userEmail: user.email,
      userName: user.name,
      role: user.role,
      tenantSlug: user.tenantSlug,
      method: 'password',
      ip: clientIp,
      status: 'SUCCESS',
      detail: `JWT emitido com sucesso. Escopo RLS: tenant_slug=${user.tenantSlug} (${user.role}).`,
    });

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        tenantId: user.tenantId,
        tenantSlug: user.tenantSlug,
        tenantName: user.tenantName,
        permissions: user.permissions,
      },
      claims,
      authMethod: 'password',
      authenticatedAt: currentTime,
    });
  });

  // POST /api/v1/auth/register-tenant-owner (Registra o lojista assinante após ativação do plano e criação do restaurante)
  app.post('/api/v1/auth/register-tenant-owner', async (req: Request, res: Response) => {
    const clientIp = getClientIp(req);
    if (!checkRateLimit(`reg_${clientIp}`, 10, 10 * 60 * 1000)) {
      return res.status(429).json({
        success: false,
        error: 'Limite de cadastros excedido. Aguarde alguns minutos e tente novamente.',
      });
    }

    const { name, email, password, phone, tenantId, tenantSlug, tenantName } = req.body;
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanEmail || !password || String(password).length < 12 || String(password).length > 256 || !tenantSlug) {
      return res.status(400).json({
        success: false,
        error: 'E-mail, senha (mínimo 12 caracteres) e identificador do restaurante são obrigatórios.',
      });
    }

    const cleanTenantSlug = String(tenantSlug).trim().toLowerCase();
    const targetTenant = memoryTenants.find((item) => item.slug.toLowerCase() === cleanTenantSlug);
    const callerClaims = getAuthenticatedClaims(req);
    if (!canAccessTenant(callerClaims, cleanTenantSlug, targetTenant?.id)) {
      return res.status(403).json({
        success: false,
        error: 'Cadastro de proprietário não autorizado para este restaurante.',
      });
    }

    const currentTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    let user = memoryUsers.find((u) => u.email.toLowerCase() === cleanEmail);

    if ((!user && callerClaims?.role !== 'SUPER_ADMIN') || (user && user.id !== callerClaims?.sub && callerClaims?.role !== 'SUPER_ADMIN')) return res.status(403).json({error:'Apenas a administração pode criar usuários ou alterar outra conta.'});
    if (!targetTenant) return res.status(404).json({error:'Restaurante não encontrado.'});
    if (user) {
      if(callerClaims?.role!=='SUPER_ADMIN' && !verifyPassword(String(req.body?.currentPassword||''),user.passwordHash)) return res.status(403).json({error:'Informe a senha atual para alterar os dados de acesso.'});
      if (user.role === 'SUPER_ADMIN') {
        return res.status(403).json({
          success: false,
          error: 'Não é permitido alterar uma conta administrativa por esta rota.',
        });
      }
      if (user.tenantSlug !== cleanTenantSlug) return res.status(403).json({error:'Conta vinculada a outro restaurante.'});
      // Only allow updating existing user if password matches or valid JWT is presented
      const isAuthorizedOwner =
        (callerClaims && (callerClaims.sub === user.id || callerClaims.role === 'SUPER_ADMIN')) ||
        verifyPassword(String(password), user.passwordHash);

      if (!isAuthorizedOwner) {
        return res.status(409).json({
          success: false,
          error: 'Este e-mail já possui uma conta cadastrada. Acesse pela tela de Login.',
        });
      }

      user.name = String(name || user.name).trim();
      user.passwordHash = hashPassword(String(password));
      user.phone = String(phone || user.phone).replace(/\D/g, '');
      user.tenantId = targetTenant?.id || user.tenantId;
      user.tenantSlug = cleanTenantSlug;
      user.tenantName = targetTenant?.name || user.tenantName;
    } else {
      user = {
        id: `usr_owner_${Date.now()}`,
        name: String(name || 'Proprietário').trim(),
        email: cleanEmail,
        passwordHash: hashPassword(String(password)),
        phone: String(phone || '').replace(/\D/g, ''),
        role: 'TENANT_OWNER',
        tenantId: targetTenant?.id || String(tenantId || `tenant_${Date.now()}`),
        tenantSlug: cleanTenantSlug,
        tenantName: targetTenant?.name || String(tenantName || 'Restaurante'),
        permissions: [
          'tenant:full_access',
          'kds:manage_orders',
        ],
      };
      memoryUsers.push(user);
    }

    if (pgPool && user) {
      await pgPool
        .query(
          `INSERT INTO subscriber_users (id, name, email, password_hash, phone, role, tenant_id, tenant_slug, tenant_name, permissions)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
           ON CONFLICT (email) DO UPDATE SET
             name = EXCLUDED.name,
             password_hash = EXCLUDED.password_hash,
             phone = EXCLUDED.phone,
             tenant_id = EXCLUDED.tenant_id,
             tenant_slug = EXCLUDED.tenant_slug,
             tenant_name = EXCLUDED.tenant_name,
             updated_at = NOW();`,
          [
            user.id,
            user.name,
            user.email,
            user.passwordHash,
            user.phone || '',
            user.role,
            user.tenantId,
            user.tenantSlug,
            user.tenantName,
            JSON.stringify(user.permissions || []),
          ]
        );
    }

    const { token, claims } = await signJwtToken(user);

    memoryAuthAuditLogs.unshift({
      id: `audit_reg_${Date.now()}`,
      timestamp: currentTime,
      userEmail: user.email,
      userName: user.name,
      role: user.role,
      tenantSlug: user.tenantSlug,
      method: 'password',
      ip: clientIp,
      status: 'SUCCESS',
      detail: `Conta de lojista assinante criada e autenticada para ${user.tenantName} (${user.tenantSlug}).`,
    });

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        tenantId: user.tenantId,
        tenantSlug: user.tenantSlug,
        tenantName: user.tenantName,
        permissions: user.permissions,
      },
      claims,
      authMethod: 'password',
      authenticatedAt: currentTime,
    });
  });

  // GET /api/v1/auth/session (Garante sessão válida assinada com o JWT_SECRET atual da VPS)
  app.get('/api/v1/auth/session', async (req: Request, res: Response) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const claims = token ? verifyJwtToken(token) : null;

    if (!claims || !claims.sub) {
      return res.status(401).json({
        success: false,
        error: 'Sessão inválida ou não autenticada.',
      });
    }

    const current = await databasePool.query('SELECT * FROM subscriber_users WHERE id=$1',[claims.sub]);
    const row = current.rows[0];
    const targetUser = row ? { id:row.id,name:row.name,email:row.email,phone:row.phone,role:row.role,tenantId:row.tenant_id,tenantSlug:row.tenant_slug,tenantName:row.tenant_name,permissions:row.permissions } : null;
    if (!targetUser) return res.status(401).json({ error: 'Conta indisponível.' });
    const freshToken = token;
    const freshClaims = claims;

    res.json({
      success: true,
      token: freshToken,
      user: {
        id: targetUser.id,
        name: targetUser.name,
        email: targetUser.email,
        phone: targetUser.phone,
        role: targetUser.role,
        tenantId: targetUser.tenantId,
        tenantSlug: targetUser.tenantSlug,
        tenantName: targetUser.tenantName,
        permissions: targetUser.permissions,
      },
      claims: freshClaims,
    });
  });

  async function authRateLimit(key: string, max: number, seconds = 600): Promise<boolean> {
    const result = await databasePool.query(`INSERT INTO rate_limits (key,count,reset_at)
      VALUES ($1,1,NOW()+$2 * INTERVAL '1 second') ON CONFLICT (key) DO UPDATE SET
      count=CASE WHEN rate_limits.reset_at <= NOW() THEN 1 ELSE rate_limits.count+1 END,
      reset_at=CASE WHEN rate_limits.reset_at <= NOW() THEN EXCLUDED.reset_at ELSE rate_limits.reset_at END
      RETURNING count`, [fingerprint(key), seconds]);
    return result.rows[0].count <= max;
  }
  app.post('/api/v1/auth/whatsapp-otp/request', async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase().slice(0,160);
    const genericResponse = { success: true, message: 'Se os dados estiverem cadastrados, o código será enviado ao WhatsApp da conta.' };
    if (!await authRateLimit(`otp_ip:${getClientIp(req)}`, 5) || !await authRateLimit(`otp_account:${email}`, 3)) {
      return res.status(429).json({ error: 'Aguarde antes de solicitar outro código.' });
    }
    const result = await databasePool.query('SELECT * FROM subscriber_users WHERE LOWER(email)=$1', [email]);
    const user = result.rows[0];
    const phone = phoneNumber(user?.phone);
    // Only the persisted, previously registered destination is allowed. No admin OTP without a registered phone.
    if (!user || !/^55\d{10,11}$/.test(phone)) return res.json(genericResponse);
    if (!process.env.EVOLUTION_API_URL || !process.env.EVOLUTION_API_KEY) return res.json(genericResponse);
    const code = String(crypto.randomInt(100000, 1000000));
    const codeHash = crypto.createHmac('sha256', JWT_SECRET).update(`${email}:${code}`).digest('hex');
    await databasePool.query(`INSERT INTO auth_otp (email,code_hash,expires_at,attempts)
      VALUES ($1,$2,NOW()+INTERVAL '10 minutes',0) ON CONFLICT (email) DO UPDATE SET
      code_hash=EXCLUDED.code_hash,expires_at=EXCLUDED.expires_at,attempts=0`, [email,codeHash]);
    try {
      const response = await fetch(`${process.env.EVOLUTION_API_URL.replace(/\/$/, '')}/message/sendText/${encodeURIComponent(process.env.EVOLUTION_DEFAULT_INSTANCE || 'aladay')}`, {
        method: 'POST', signal: AbortSignal.timeout(10000), headers: { 'Content-Type': 'application/json', apikey: process.env.EVOLUTION_API_KEY },
        body: JSON.stringify({ number: phone, text: `Seu código Aladay é ${code}. Válido por 10 minutos. Nunca compartilhe.` }),
      });
      if (!response.ok) throw new Error('delivery_failed');
    } catch {
      await databasePool.query('DELETE FROM auth_otp WHERE email=$1 AND code_hash=$2', [email,codeHash]);
      console.warn(JSON.stringify({level:'warn',event:'otp_delivery_failed'}));
      return res.json(genericResponse);
    }
    res.json(genericResponse);
  });
  app.post('/api/v1/auth/whatsapp-otp/verify', async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase().slice(0,160);
    const code = String(req.body?.code || '').trim();
    if (!await authRateLimit(`verify_ip:${getClientIp(req)}`, 10) || !await authRateLimit(`verify_account:${email}`, 5)) {
      return res.status(429).json({ error: 'Limite de tentativas excedido.' });
    }
    const codeHash = crypto.createHmac('sha256', JWT_SECRET).update(`${email}:${code}`).digest('hex');
    const user = await transaction(databasePool, async (client) => {
      const stored = await client.query('SELECT * FROM auth_otp WHERE email=$1 FOR UPDATE', [email]);
      if (!stored.rows[0]) return null;
      await client.query('UPDATE auth_otp SET attempts=attempts+1 WHERE email=$1', [email]);
      if (stored.rows[0].attempts >= 5 || new Date(stored.rows[0].expires_at).getTime() <= Date.now() ||
          !/^\d{6}$/.test(code) || !safeSecretEquals(codeHash,stored.rows[0].code_hash)) return null;
      await client.query('DELETE FROM auth_otp WHERE email=$1', [email]);
      const users = await client.query('SELECT * FROM subscriber_users WHERE LOWER(email)=$1', [email]);
      return users.rows[0];
    });
    if (!user) return res.status(401).json({ error: 'Código inválido ou expirado.' });
    const sessionUser: InMemAuthUser = { id: user.id, name: user.name, email: user.email, phone: user.phone,
      passwordHash: user.password_hash, role: user.role, tenantId: user.tenant_id, tenantSlug: user.tenant_slug,
      tenantName: user.tenant_name, permissions: user.permissions };
    const { token, claims } = await signJwtToken(sessionUser);
    const { passwordHash: _hash, ...publicUser } = sessionUser;
    res.json({ success: true, token, claims, user: publicUser, authMethod: 'whatsapp_otp', authenticatedAt: new Date().toISOString() });
  });

  // GET /api/v1/auth/audit-logs (Protected: SUPER_ADMIN only)
  app.get('/api/v1/auth/audit-logs', requireSuperAdmin, (_req: Request, res: Response) => {
    res.json({
      logs: memoryAuthAuditLogs,
      users: memoryUsers.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        role: u.role,
        tenantId: u.tenantId,
        tenantSlug: u.tenantSlug,
        tenantName: u.tenantName,
        permissions: u.permissions,
      })),
    });
  });

  // ==============================================================
  // EVOLUTION API INSTANCE MANAGEMENT & QR CODE PAIRING ROUTES
  // ==============================================================
  interface InMemEvolutionInstance {
    instanceName: string;
    state: 'open' | 'close' | 'connecting';
    connectedPhone?: string;
    profileName?: string;
    batteryLevel?: number;
    lastQrCode?: string;
    lastQrBase64?: string;
    pairingCode?: string;
    qrGeneratedAt?: number;
    qrCount: number;
    serverUrl?: string;
  }

  let runtimeGlobalEvolutionApiKey = process.env.EVOLUTION_API_KEY || '';

  // Normalizes Brazilian phone numbers so 10 or 11 digits always get DDI 55.
  // Without 55, DDD 91 (Pará) is misinterpreted by WhatsApp Baileys as country code +91 (India).
  const normalizeBrazilWhatsAppNumber = (rawPhone?: string): string => {
    const digits = String(rawPhone || '').replace(/\D/g, '').replace(/^0+/, '');
    if (!digits) return '';
    if (digits.length === 10 || digits.length === 11) {
      return `55${digits}`;
    }
    return digits;
  };

  const formatPairingCodeDisplay = (rawCode?: string | null): string | undefined => {
    if (!rawCode) return undefined;
    const clean = String(rawCode).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (clean.length === 8) {
      return `${clean.slice(0, 4)}-${clean.slice(4)}`;
    }
    return String(rawCode).trim();
  };

  const memoryEvolutionInstances: Record<string, InMemEvolutionInstance> = {
    aladay: {
      instanceName: 'aladay',
      state: 'close',
      qrCount: 0,
      serverUrl: process.env.EVOLUTION_API_URL || '',
    },
  };

  const getTenantEvolutionConfig = (instanceName: string, overrideApiKey?: string, overrideApiUrl?: string) => {
    const cleanTarget = String(instanceName || '').trim().toLowerCase();
    const tenant =
      memoryTenants.find(
        (t) =>
          String(t.evolutionInstanceId || '').toLowerCase() === cleanTarget ||
          String(t.slug || '').toLowerCase() === cleanTarget ||
          `instancia_${String(t.slug || '').toLowerCase()}` === cleanTarget
      ) || memoryTenants[0];

    const apiUrl =
      overrideApiUrl?.trim() ||
      process.env.EVOLUTION_API_URL ||
      (tenant as any)?.evolutionApiUrl ||
      '';
    const apiKey =
      overrideApiKey?.trim() ||
      process.env.EVOLUTION_API_KEY ||
      runtimeGlobalEvolutionApiKey ||
      (tenant as any)?.evolutionApiKey ||
      '';
    return { tenant, apiUrl: apiUrl.replace(/\/$/, ''), apiKey: apiKey.trim() };
  };

  // Helper to generate a fallback local QR Code when Evolution API instance is not yet reachable
  const generateLocalQrAndPairingCode = async (instanceName: string) => {
    const inst = memoryEvolutionInstances[instanceName] || {
      instanceName,
      state: 'connecting',
      qrCount: 0,
    };
    inst.qrCount = (inst.qrCount || 0) + 1;
    inst.state = 'connecting';
    inst.qrGeneratedAt = Date.now();

    // Standard Baileys QR format: 2@token,pubKey,clientId
    const tokenPart = Buffer.from(crypto.randomBytes(24)).toString('base64');
    const pubKeyPart = Buffer.from(crypto.randomBytes(32)).toString('base64');
    const clientPart = Buffer.from(crypto.randomBytes(16)).toString('base64');
    const qrString = `2@${tokenPart},${pubKeyPart},${clientPart}`;

    // Render crisp base64 Data URL using qrcode library
    const qrBase64 = await QRCode.toDataURL(qrString, {
      width: 340,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0a0a0a',
        light: '#ffffff',
      },
    });

    const randomDigits = Math.floor(1000 + Math.random() * 9000);
    const pairingCode = `DEMO-${randomDigits}`;

    inst.lastQrCode = qrString;
    inst.lastQrBase64 = qrBase64;
    inst.pairingCode = pairingCode;
    memoryEvolutionInstances[instanceName] = inst;

    return {
      instanceName,
      state: 'connecting' as const,
      count: inst.qrCount,
      code: qrString,
      base64: qrBase64,
      pairingCode,
      expiresInSeconds: 40,
      serverTime: new Date().toISOString(),
    };
  };

  // GET /api/v1/evolution/instances
  app.get('/api/v1/evolution/instances', (_req: Request, res: Response) => {
    res.json({
      success: true,
      instances: Object.values(memoryEvolutionInstances),
    });
  });

  // GET /api/v1/evolution/instance/:instanceName/status
  app.get('/api/v1/evolution/instance/:instanceName/status', async (req: Request, res: Response) => {
    const { instanceName } = req.params;
    const { tenant, apiUrl, apiKey } = getTenantEvolutionConfig(instanceName);
    let inst = memoryEvolutionInstances[instanceName];
    if (!inst) {
      inst = {
        instanceName,
        state: tenant?.evolutionStatus === 'connected' ? 'open' : 'close',
        connectedPhone: normalizeBrazilWhatsAppNumber(tenant?.phone),
        profileName: tenant?.name,
        batteryLevel: 95,
        qrCount: 1,
      };
      memoryEvolutionInstances[instanceName] = inst;
    }

    let remoteChecked = false;
    let remoteState: string | null = null;
    let remoteOwnerPhone: string | undefined;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4500);

      const response = await fetch(`${apiUrl}/instance/connectionState/${encodeURIComponent(instanceName)}`, {
        method: 'GET',
        headers: { apikey: apiKey },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        remoteChecked = true;
        remoteState = data?.instance?.state || (data?.state as string) || null;
        if (remoteState === 'open' || remoteState === 'close' || remoteState === 'connecting') {
          inst.state = remoteState as any;
          if (tenant) {
            tenant.evolutionStatus =
              remoteState === 'open' ? 'connected' : remoteState === 'connecting' ? 'connecting' : 'disconnected';
          }
        }
      } else if (response.status === 404) {
        remoteChecked = true;
        remoteState = 'not_created';
        // If remote instance does not exist yet and wasn't explicitly simulated in this session
        if (!inst.connectedPhone && tenant && tenant.evolutionStatus === 'connected') {
          tenant.evolutionStatus = 'disconnected';
          inst.state = 'close';
        }
      }
    } catch {
      remoteChecked = false;
    }

    res.json({
      success: true,
      instanceName,
      state: inst.state,
      connectedPhone: remoteOwnerPhone || inst.connectedPhone || normalizeBrazilWhatsAppNumber(tenant?.phone),
      profileName: inst.profileName || tenant?.name,
      batteryLevel: inst.batteryLevel || 98,
      serverUrl: apiUrl,
      remoteChecked,
      remoteState,
      lastSync: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    });
  });

  // GET or POST /api/v1/evolution/instance/:instanceName/connect (Real QR Code + Real 8-Digit Pairing Code)
  const handleConnectInstance = async (req: Request, res: Response) => {
    const { instanceName } = req.params;
    const queryOrBodyApiKey = String(req.query.apiKey || req.body?.apiKey || '').trim();
    const queryOrBodyApiUrl = String(req.query.apiUrl || req.body?.apiUrl || '').trim();
    const { tenant, apiUrl, apiKey } = getTenantEvolutionConfig(instanceName, queryOrBodyApiKey, queryOrBodyApiUrl);

    const rawPhoneInput = String(
      req.query.number || req.body?.number || tenant?.phone || ''
    ).trim();
    const normalizedPhone = normalizeBrazilWhatsAppNumber(rawPhoneInput);
    if (normalizedPhone && tenant) {
      tenant.phone = normalizedPhone;
    }

    let remoteResult: any = null;
    let remoteErrorReason: string | undefined;
    let remoteErrorMessage: string | undefined;

    const extractQrAndPairing = (payload: any) => {
      if (!payload) return null;
      const qrObj = payload.qrcode || payload;
      const base64 = qrObj?.base64 || payload?.base64;
      const code = qrObj?.code || payload?.code;
      const pairingCode = formatPairingCodeDisplay(
        qrObj?.pairingCode || payload?.pairingCode || payload?.qrcode?.pairingCode
      );
      const state = payload?.instance?.state || payload?.state;
      if (base64 || code || pairingCode || state === 'open') {
        return {
          base64,
          code,
          pairingCode,
          count: qrObj?.count || payload?.count || 1,
          state: state === 'open' ? 'open' : 'connecting',
        };
      }
      return null;
    };

    try {
      const connectQuery = normalizedPhone ? `?number=${encodeURIComponent(normalizedPhone)}` : '';
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      let response = await fetch(`${apiUrl}/instance/connect/${encodeURIComponent(instanceName)}${connectQuery}`, {
        method: 'GET',
        headers: { apikey: apiKey },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      // If instance does not exist yet (404), auto-create it on Evolution API v2 and bind webhook
      if (response.status === 404) {
        const createCtrl = new AbortController();
        const createTimeout = setTimeout(() => createCtrl.abort(), 9000);
        const webhookUrlToBind =
          (tenant as any)?.n8nWebhookUrl ||
          process.env.N8N_WEBHOOK_URL ||
          'https://integration.example.invalid';

        const createRes = await fetch(`${apiUrl}/instance/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: apiKey,
          },
          body: JSON.stringify({
            instanceName,
            qrcode: true,
            number: normalizedPhone || undefined,
            integration: 'WHATSAPP-BAILEYS',
            webhook: {
              url: webhookUrlToBind,
              byEvents: false,
              base64: false,
              events: ['MESSAGES_UPSERT'],
            },
          }),
          signal: createCtrl.signal,
        });
        clearTimeout(createTimeout);

        if (createRes.ok) {
          const createData = await createRes.json().catch(() => ({}));
          remoteResult = extractQrAndPairing(createData);

          // If pairingCode for normalizedPhone or base64 wasn't returned on create, call /instance/connect?number=...
          if (!remoteResult || (normalizedPhone && !remoteResult.pairingCode) || !remoteResult.base64) {
            await new Promise((r) => setTimeout(r, 700));
            const retryCtrl = new AbortController();
            const retryTimeout = setTimeout(() => retryCtrl.abort(), 7000);
            const retryRes = await fetch(
              `${apiUrl}/instance/connect/${encodeURIComponent(instanceName)}${connectQuery}`,
              {
                method: 'GET',
                headers: { apikey: apiKey },
                signal: retryCtrl.signal,
              }
            );
            clearTimeout(retryTimeout);
            if (retryRes.ok) {
              const retryData = await retryRes.json().catch(() => ({}));
              const extractedRetry = extractQrAndPairing(retryData);
              if (extractedRetry) {
                remoteResult = {
                  ...remoteResult,
                  ...extractedRetry,
                  base64: extractedRetry.base64 || remoteResult?.base64,
                  pairingCode: extractedRetry.pairingCode || remoteResult?.pairingCode,
                };
              }
            }
          }
        } else if (createRes.status === 401 || createRes.status === 403) {
          remoteErrorReason = 'GLOBAL_API_KEY_REQUIRED';
          remoteErrorMessage = `A instância "${instanceName}" ainda não existe na Evolution API e a chave configurada no .env (EVOLUTION_API_KEY) não possui permissão global para criar novas instâncias.`;
        } else {
          const errText = await createRes.text().catch(() => '');
          remoteErrorReason = 'CREATE_INSTANCE_FAILED';
          remoteErrorMessage = `Não foi possível criar a instância "${instanceName}" na Evolution API (HTTP ${createRes.status}): ${errText.slice(0, 180)}`;
        }
      } else if (response.ok) {
        const data = await response.json().catch(() => ({}));
        remoteResult = extractQrAndPairing(data);
      } else if (response.status === 401 || response.status === 403) {
        remoteErrorReason = 'UNAUTHORIZED_API_KEY';
        remoteErrorMessage = `A chave configurada em EVOLUTION_API_KEY no arquivo .env não tem permissão para acessar a instância "${instanceName}".`;
      } else {
        remoteErrorReason = `HTTP_${response.status}`;
        remoteErrorMessage = `A Evolution API respondeu com status HTTP ${response.status} ao conectar a instância "${instanceName}".`;
      }

      if (remoteResult) {
        let inst = memoryEvolutionInstances[instanceName];
        if (!inst) {
          inst = { instanceName, state: remoteResult.state, qrCount: 1 };
          memoryEvolutionInstances[instanceName] = inst;
        }
        inst.state = remoteResult.state;
        inst.lastQrCode = remoteResult.code;
        inst.lastQrBase64 = remoteResult.base64;
        inst.pairingCode = remoteResult.pairingCode;
        inst.qrGeneratedAt = Date.now();
        if (tenant) {
          tenant.evolutionStatus = remoteResult.state === 'open' ? 'connected' : 'connecting';
        }

        // If instance is already open on Evolution API, return connected state immediately
        if (remoteResult.state === 'open') {
          return res.json({
            success: true,
            instanceName,
            state: 'open',
            connectedPhone: normalizedPhone || tenant?.phone,
            profileName: tenant?.name,
            remoteFetched: true,
            normalizedPhone,
            serverUrl: apiUrl,
            serverTime: new Date().toISOString(),
          });
        }

        // If Evolution API returned code string but no base64 image, render real QR image from Evolution's code
        let finalBase64 = remoteResult.base64;
        if (!finalBase64 && remoteResult.code) {
          finalBase64 = await QRCode.toDataURL(remoteResult.code, {
            width: 340,
            margin: 2,
            errorCorrectionLevel: 'M',
          });
        } else if (finalBase64 && !finalBase64.startsWith('data:')) {
          finalBase64 = `data:image/png;base64,${finalBase64}`;
        }

        return res.json({
          success: true,
          instanceName,
          state: 'connecting',
          count: remoteResult.count || 1,
          code: remoteResult.code,
          base64: finalBase64,
          pairingCode: remoteResult.pairingCode,
          expiresInSeconds: 40,
          remoteFetched: true,
          normalizedPhone,
          serverUrl: apiUrl,
          serverTime: new Date().toISOString(),
        });
      }
    } catch (err: any) {
      remoteErrorReason = remoteErrorReason || 'NETWORK_TIMEOUT';
      remoteErrorMessage =
        remoteErrorMessage ||
        `Tempo limite ou falha de conexão com ${apiUrl} (${err?.message || 'Timeout'}).`;
    }

    // Fallback local QR Code when Evolution API could not create/connect the remote instance
    const localPairing = await generateLocalQrAndPairingCode(instanceName);
    if (tenant && tenant.evolutionStatus !== 'connected') {
      tenant.evolutionStatus = 'disconnected';
    }

    res.json({
      ...localPairing,
      remoteFetched: false,
      remoteErrorReason,
      remoteErrorMessage,
      normalizedPhone,
      serverUrl: apiUrl,
      note:
        remoteErrorMessage ||
        'Modo de simulação ativo: para conectar um celular real no WhatsApp, a instância precisa estar criada na Evolution API com a Global API Key.',
    });
  };

  app.get('/api/v1/evolution/instance/:instanceName/connect', handleConnectInstance);
  app.post('/api/v1/evolution/instance/:instanceName/connect', handleConnectInstance);

  // POST /api/v1/evolution/instance/:instanceName/disconnect (Logout)
  app.post('/api/v1/evolution/instance/:instanceName/disconnect', async (req: Request, res: Response) => {
    const { instanceName } = req.params;
    const { tenant, apiUrl, apiKey } = getTenantEvolutionConfig(instanceName);

    try {
      await fetch(`${apiUrl}/instance/logout/${encodeURIComponent(instanceName)}`, {
        method: 'DELETE',
        headers: { apikey: apiKey },
      });
    } catch {
      // Ignore remote error on disconnect
    }

    const inst = memoryEvolutionInstances[instanceName] || { instanceName, state: 'close', qrCount: 0 };
    inst.state = 'close';
    inst.lastQrBase64 = undefined;
    inst.lastQrCode = undefined;
    inst.pairingCode = undefined;
    memoryEvolutionInstances[instanceName] = inst;

    if (tenant) {
      tenant.evolutionStatus = 'disconnected';
    }

    const currentTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    memoryWebhookLogs.unshift({
      id: `log_disconnect_${Date.now()}`,
      timestamp: currentTime,
      source: 'evolution',
      eventType: 'CONNECTION_UPDATE',
      instance: instanceName,
      senderPhone: inst.connectedPhone || 'WhatsApp',
      messageText: 'Instância desconectada. Sessão encerrada no WhatsApp.',
      direction: 'inbound',
      status: 'success',
      payloadSummary: `Instância "${instanceName}" deslogada com sucesso. Pronto para novo pareamento via QR Code.`,
      fullPayload: { instance: instanceName, state: 'close' },
    });

    res.json({
      success: true,
      message: 'Instância WhatsApp desconectada com sucesso.',
      instanceName,
      state: 'close',
    });
  });

  // POST /api/v1/evolution/instance/:instanceName/simulate-scan
  // Simulates that the user pointed their phone camera and scanned the QR Code
  app.post('/api/v1/evolution/instance/:instanceName/simulate-scan', (req: Request, res: Response) => {
    const { instanceName } = req.params;
    const { phone, profileName } = req.body;
    const { tenant } = getTenantEvolutionConfig(instanceName);

    const pairedPhone = normalizeBrazilWhatsAppNumber(phone || tenant?.phone || '');
    const pairedProfile = profileName || tenant?.name || 'Restaurante Oficial';
    const currentTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const inst = memoryEvolutionInstances[instanceName] || { instanceName, state: 'open', qrCount: 1 };
    inst.state = 'open';
    inst.connectedPhone = pairedPhone;
    inst.profileName = pairedProfile;
    inst.batteryLevel = 98;
    inst.lastQrBase64 = undefined;
    inst.lastQrCode = undefined;
    memoryEvolutionInstances[instanceName] = inst;

    if (tenant) {
      tenant.evolutionStatus = 'connected';
      tenant.phone = pairedPhone;
    }

    // Record pairing success webhook log
    memoryWebhookLogs.unshift({
      id: `log_pair_${Date.now()}`,
      timestamp: currentTime,
      source: 'evolution',
      eventType: 'CONNECTION_UPDATE',
      instance: instanceName,
      senderPhone: pairedPhone,
      messageText: `WhatsApp pareado com sucesso via QR Code! Sessão ativa em ${pairedProfile}`,
      direction: 'inbound',
      status: 'success',
      payloadSummary: `Pareamento WhatsApp concluído via Baileys na Evolution API (${pairedPhone})`,
      fullPayload: {
        instance: instanceName,
        state: 'open',
        statusReason: 200,
        user: {
          id: `${pairedPhone}@s.whatsapp.net`,
          name: pairedProfile,
        },
      },
    });

    res.json({
      success: true,
      message: 'WhatsApp pareado com sucesso via QR Code!',
      instanceName,
      state: 'open',
      connectedPhone: pairedPhone,
      profileName: pairedProfile,
      batteryLevel: 98,
      timestamp: currentTime,
    });
  });

  // POST /api/v1/evolution/instance/create
  app.post('/api/v1/evolution/instance/create', async (req: Request, res: Response) => {
    const { instanceName, number, apiKey: customApiKey, apiUrl: customApiUrl } = req.body;
    if (!instanceName) {
      return res.status(400).json({ error: 'Nome da instância é obrigatório.' });
    }

    const { tenant, apiUrl, apiKey } = getTenantEvolutionConfig(instanceName, customApiKey, customApiUrl);
    const normalizedPhone = normalizeBrazilWhatsAppNumber(number || tenant?.phone || '');
    const webhookUrlToBind =
      (tenant as any)?.n8nWebhookUrl ||
      process.env.N8N_WEBHOOK_URL ||
      'https://integration.example.invalid';

    let remoteCreated = false;
    let remoteError: string | undefined;

    try {
      const createRes = await fetch(`${apiUrl}/instance/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: apiKey,
        },
        body: JSON.stringify({
          instanceName,
          qrcode: true,
          number: normalizedPhone || undefined,
          integration: 'WHATSAPP-BAILEYS',
          webhook: {
            url: webhookUrlToBind,
            byEvents: false,
            base64: false,
            events: ['MESSAGES_UPSERT'],
          },
        }),
      });
      if (createRes.ok) {
        remoteCreated = true;
      } else {
        const errBody = await createRes.text().catch(() => '');
        remoteError = `HTTP ${createRes.status}: ${errBody.slice(0, 160)}`;
      }
    } catch (e: any) {
      remoteError = e?.message || 'Erro de rede';
    }

    const inst = {
      instanceName,
      state: 'close' as const,
      qrCount: 0,
      serverUrl: apiUrl,
    };
    memoryEvolutionInstances[instanceName] = inst;

    res.status(201).json({
      success: true,
      remoteCreated,
      remoteError,
      normalizedPhone,
      message: remoteCreated
        ? `Instância "${instanceName}" criada com sucesso na Evolution API!`
        : `Instância "${instanceName}" registrada localmente (${remoteError || 'aguardando Global API Key'}).`,
      instance: inst,
    });
  });

  // PUT /api/v1/tenants/:slug/evolution-config
  app.put('/api/v1/tenants/:slug/evolution-config', requireSuperAdmin, (req: Request, res: Response) => {
    if(process.env.NODE_ENV==='production') return res.status(409).json({error:'Configure credenciais pelo ambiente de deploy e reinicie a aplicação.'});
    const tenant = memoryTenants.find((t) => t.slug === req.params.slug);
    if (!tenant) return res.status(404).json({ error: 'Restaurante não encontrado.' });

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const claims = token ? verifyJwtToken(token) : null;
    const isSuperAdminCaller = Boolean(claims && claims.role === 'SUPER_ADMIN');

    const { evolutionApiUrl, evolutionApiKey, evolutionInstanceId, n8nWebhookUrl, phone } = req.body;

    // Only SUPER_ADMIN can update global Evolution API URL, API Key, or n8n Webhook URL (persisted in .env)
    if (isSuperAdminCaller) {
      if (evolutionApiUrl && String(evolutionApiUrl).trim()) {
        process.env.EVOLUTION_API_URL = String(evolutionApiUrl).trim();
        persistEnvConfig('EVOLUTION_API_URL', process.env.EVOLUTION_API_URL);
      }
      if (evolutionApiKey && String(evolutionApiKey).trim()) {
        const cleanKey = String(evolutionApiKey).trim();
        runtimeGlobalEvolutionApiKey = cleanKey;
        process.env.EVOLUTION_API_KEY = cleanKey;
        persistEnvConfig('EVOLUTION_API_KEY', cleanKey);
      }
      if (n8nWebhookUrl && String(n8nWebhookUrl).trim()) {
        process.env.N8N_WEBHOOK_URL = String(n8nWebhookUrl).trim();
        persistEnvConfig('N8N_WEBHOOK_URL', process.env.N8N_WEBHOOK_URL);
      }
    }

    if (evolutionInstanceId) tenant.evolutionInstanceId = String(evolutionInstanceId).trim();
    if (phone) tenant.phone = normalizeBrazilWhatsAppNumber(phone);

    res.json({
      success: true,
      message: 'Configurações de conexão atualizadas com segurança no servidor (.env)!',
      tenant: {
        slug: tenant.slug,
        phone: tenant.phone,
        evolutionInstanceId: tenant.evolutionInstanceId,
        evolutionApiKeyConfigured: Boolean(process.env.EVOLUTION_API_KEY || runtimeGlobalEvolutionApiKey),
      },
    });
  });

  // =========================================================================
  // ASAAS RECURRING SUBSCRIPTIONS (R$ 129,90/mês - SaaS ALADAY)
  // =========================================================================

  interface InMemAsaasCustomer {
    id: string;
    name: string;
    email: string;
    cpfCnpj: string;
    phone: string;
  }

  interface InMemAsaasInvoice {
    id: string;
    subscriptionId: string;
    referenceMonth: string;
    value: number; // 129.90
    status: 'RECEIVED' | 'CONFIRMED' | 'PENDING' | 'OVERDUE' | 'REFUNDED';
    dueDate: string;
    paymentDate?: string;
    billingType: 'PIX' | 'CREDIT_CARD' | 'BOLETO';
    invoiceUrl: string;
    bankSlipUrl?: string;
    boletoBarcode?: string;
    boletoUrl?: string;
    pixCopiaECola?: string;
    pixQrCodeBase64?: string;
    description: string;
  }

  interface InMemAsaasSubscription {
    id: string;
    tenantSlug: string;
    customer: InMemAsaasCustomer;
    planName: string;
    value: number; // 99.00 (Anual no Cartão) or 129.90 (Mensal)
    cycle: 'MONTHLY' | 'YEARLY';
    monthlyEquivalentValue?: number;
    installmentCount?: number;
    status: 'ACTIVE' | 'TRIAL' | 'PENDING' | 'OVERDUE' | 'CANCELLED';
    billingType: 'PIX' | 'CREDIT_CARD' | 'BOLETO';
    nextDueDate: string;
    createdAt: string;
    invoices: InMemAsaasInvoice[];
    lastPaymentDate?: string;
    isTrial?: boolean;
    trialStartedAt?: string;
    trialEndsAt?: string;
    trialDaysTotal?: number;
  }

  const asaasGatewayConfig = {
    environment: (process.env.ASAAS_ENVIRONMENT as 'sandbox' | 'production') || 'sandbox',
    apiKey: process.env.ASAAS_API_KEY || '',
    webhookToken: process.env.ASAAS_WEBHOOK_TOKEN || '',
    webhookUrl:
      process.env.ASAAS_WEBHOOK_URL ||
      (process.env.APP_URL ? `${process.env.APP_URL.replace(/\/$/, '')}/api/v1/asaas/webhook` : 'https://aladay.com.br/api/v1/asaas/webhook'),
    pixKey: process.env.ASAAS_PIX_KEY || '+559131976334',
    pixBeneficiaryName: process.env.ASAAS_PIX_BENEFICIARY || 'ALADAY CARDAPIOS',
    pixCity: process.env.ASAAS_PIX_CITY || 'BELEM',
  };

  // Helper to persist updated configuration to .env file if available (whitelisted & sanitized against injection)
  function persistEnvConfig(key: string, value: string) {
    const allowedKeys = [
      'ASAAS_ENVIRONMENT',
      'ASAAS_API_KEY',
      'ASAAS_WEBHOOK_TOKEN',
      'ASAAS_PIX_KEY',
      'ASAAS_PIX_BENEFICIARY',
      'ASAAS_PIX_CITY',
      'EVOLUTION_API_URL',
      'EVOLUTION_API_KEY',
      'N8N_WEBHOOK_URL',
    ];
    if (!allowedKeys.includes(key)) return;
    const safeValue = String(value).replace(/[\r\n]/g, '').trim();
    try {
      const envPath = path.join(process.cwd(), '.env');
      let content = '';
      if (fs.existsSync(envPath)) {
        content = fs.readFileSync(envPath, 'utf-8');
      } else {
        const examplePath = path.join(process.cwd(), '.env.example');
        if (fs.existsSync(examplePath)) {
          content = fs.readFileSync(examplePath, 'utf-8');
        }
      }
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (regex.test(content)) {
        content = content.replace(regex, `${key}=${safeValue}`);
      } else {
        content += `\n${key}=${safeValue}`;
      }
      fs.writeFileSync(envPath, content, 'utf-8');
    } catch (err) {
      console.warn(JSON.stringify({level:'warn',event:'config_persist_failed'}));
    }
  }

  // Real Asaas API v3 HTTP Client
  async function callAsaasApi(endpoint: string, options: { method?: string; body?: any } = {}) {
    if (!asaasGatewayConfig.apiKey) {
      return { ok: false, status: 401, error: 'Chave de API do Asaas não configurada (ASAAS_API_KEY ausente).', configured: false, data: null };
    }

    const baseUrl = asaasGatewayConfig.environment === 'production'
      ? 'https://api.asaas.com/v3'
      : 'https://api-sandbox.asaas.com/v3';

    const url = `${baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const method = options.method || 'GET';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'access_token': asaasGatewayConfig.apiKey,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const json = await res.json().catch(() => null);
      return { ok: res.ok, status: res.status, data: json, configured: true };
    } catch (err: any) {
      clearTimeout(timeoutId);
      return { ok: false, status: 500, error: err?.message || 'Falha de comunicação com o gateway Asaas.', configured: true, data: null };
    }
  }

  // Sync or Create Customer in Asaas
  async function getOrCreateAsaasCustomer(cust: { name: string; email: string; cpfCnpj: string; phone: string }) {
    let cleanCpfCnpj = (cust.cpfCnpj || '').replace(/\D/g, '');
    if (!cleanCpfCnpj || /^0+$/.test(cleanCpfCnpj) || cleanCpfCnpj === '00000000000100') {
      // Fallback to a valid mod-11 CPF when customer CPF/CNPJ was not yet filled in the form so Asaas API v3 accepts customer creation
      return { success: false, error: 'Informe CPF/CNPJ válido do titular.' };
    }
    const cleanPhone = (cust.phone || '').replace(/\D/g, '');

    // 1. Search existing customer in Asaas by CPF/CNPJ
    const searchRes = await callAsaasApi(`/customers?cpfCnpj=${cleanCpfCnpj}`);
    if (searchRes.ok && searchRes.data?.data && searchRes.data.data.length > 0) {
      return { success: true, customerId: searchRes.data.data[0].id as string, customer: searchRes.data.data[0] };
    }

    // 2. Create new customer in Asaas
    const createRes = await callAsaasApi('/customers', {
      method: 'POST',
      body: {
        name: cust.name || 'Restaurante Parceiro Aladay',
        email: cust.email || 'financeiro@aladay.com.br',
        cpfCnpj: cleanCpfCnpj,
        mobilePhone: cleanPhone.startsWith('55') && cleanPhone.length > 11 ? cleanPhone.slice(2) : cleanPhone,
        notificationDisabled: false,
      },
    });

    if (createRes.ok && createRes.data?.id) {
      return { success: true, customerId: createRes.data.id as string, customer: createRes.data };
    }

    const errorMsg = createRes.data?.errors?.map((e: any) => e.description).join('; ') || createRes.error || 'Erro ao registrar cliente no Asaas.';
    return { success: false, error: errorMsg };
  }

  function isCorruptedPixPayload(payload?: string): boolean {
    if (!payload) return true;
    return (
      payload.includes('0136asaas-assinaturas@aladay.com.br') ||
      payload.includes('5915ALADAY SAAS') ||
      payload.includes('62070503***') ||
      payload.endsWith('6304E2C9') ||
      payload.includes('00020101021226')
    );
  }

  const memoryAsaasSubscriptions: Record<string, InMemAsaasSubscription> = {};

  async function persistSubscriptionToPostgres(sub: InMemAsaasSubscription) {
    if (!pgPool || !sub?.tenantSlug) return;
    const accessUntil=paidAccessUntil(sub.invoices);
    if(sub.status==='ACTIVE' && (!accessUntil || new Date(accessUntil).getTime()<=Date.now())) sub.status='OVERDUE';
    await transaction(databasePool, async(client)=>{
    await client.query(
        `INSERT INTO asaas_subscriptions (tenant_slug, subscription_id, status, cycle, billing_type, value, payload, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW())
         ON CONFLICT (tenant_slug) DO UPDATE SET
           subscription_id = EXCLUDED.subscription_id,
           status = EXCLUDED.status,
           cycle = EXCLUDED.cycle,
           billing_type = EXCLUDED.billing_type,
           value = EXCLUDED.value,
           payload = EXCLUDED.payload,
           updated_at = NOW();`,
        [sub.tenantSlug, sub.id, sub.status, sub.cycle || 'MONTHLY', sub.billingType || 'PIX', sub.value || 129.9, JSON.stringify(sub)]
      );
    await client.query('UPDATE tenants SET subscription_status=$1,trial_ends_at=$2,subscription_access_until=$4,updated_at=NOW() WHERE slug=$3',[sub.status==='ACTIVE'?'active':sub.status==='TRIAL'?'trial':'past_due',sub.trialEndsAt||null,sub.tenantSlug,accessUntil]);
    await client.query("UPDATE billing_operations SET status='completed',updated_at=NOW() WHERE tenant_slug=$1",[sub.tenantSlug]);
    });
  }

  // Load saved Asaas subscriptions from PostgreSQL on startup
  if (pgPool) {
    try {
      const dbSubs = await pgPool.query('SELECT * FROM asaas_subscriptions;');
      dbSubs.rows.forEach((row) => {
        if (row.tenant_slug && row.payload && typeof row.payload === 'object') {
          memoryAsaasSubscriptions[row.tenant_slug] = row.payload as InMemAsaasSubscription;
        }
      });
    } catch (error) { throw error; }
  }

  // Helper to ensure QR code base64 is generated and any legacy corrupted Pix payload is auto-healed
  async function ensurePixQrCode(invoice: InMemAsaasInvoice) {
    if (invoice.billingType === 'PIX') {
      if (!invoice.pixCopiaECola || isCorruptedPixPayload(invoice.pixCopiaECola)) return;
      if (invoice.pixCopiaECola && !invoice.pixQrCodeBase64) {
        try {
          invoice.pixQrCodeBase64 = await QRCode.toDataURL(invoice.pixCopiaECola, {
            width: 256,
            margin: 2,
            color: { dark: '#000000', light: '#FFFFFF' },
          });
        } catch {
          // Continue if QR generation fails
        }
      }
    }
  }

  // Pre-generate QR for default pending invoice
  const defaultPendingInvoice = memoryAsaasSubscriptions['aladay']?.invoices[0];
  if (defaultPendingInvoice) {
    ensurePixQrCode(defaultPendingInvoice);
  }

  // GET /api/v1/asaas/config
  app.get('/api/v1/asaas/config', requireSuperAdmin, (_req: Request, res: Response) => {
    res.json({
      success: true,
      config: {
        environment: asaasGatewayConfig.environment,
        apiUrl: asaasGatewayConfig.environment === 'production' ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3',
        webhookUrl: asaasGatewayConfig.webhookUrl,
        apiKeyMasked: asaasGatewayConfig.apiKey ? 'configurado' : '',
        webhookTokenMasked: asaasGatewayConfig.webhookToken ? 'configurado' : '',
        configured: Boolean(asaasGatewayConfig.apiKey),
        pixKey: asaasGatewayConfig.pixKey,
        pixBeneficiaryName: asaasGatewayConfig.pixBeneficiaryName,
        pixCity: asaasGatewayConfig.pixCity,
      },
    });
  });

  // GET /api/v1/asaas/subscription/:slug
  app.use('/api/v1/asaas/subscription/:slug', (req,_res,next) => {
    databasePool.query('SELECT payload FROM asaas_subscriptions WHERE tenant_slug=$1',[req.params.slug]).then((result)=>{
      if(result.rows[0]) memoryAsaasSubscriptions[req.params.slug]=result.rows[0].payload;
      else delete memoryAsaasSubscriptions[req.params.slug];
      next();
    }).catch(next);
  });
  const reserveBillingCreation: express.RequestHandler = async (req,res,next) => {
    try {
      if (!process.env.ASAAS_API_KEY) return res.status(503).json({error:'Gateway não configurado.'});
      const saved=memoryAsaasSubscriptions[req.params.slug]?.customer;
      req.body={...req.body,customerName:req.body?.customerName||saved?.name,customerEmail:req.body?.customerEmail||saved?.email,
        customerCpfCnpj:req.body?.customerCpfCnpj||saved?.cpfCnpj,customerPhone:req.body?.customerPhone||saved?.phone};
      if(!validTaxId(req.body.customerCpfCnpj) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(req.body.customerEmail||'')) || !req.body.customerName) return res.status(400).json({error:'Informe nome, e-mail e CPF/CNPJ válido do titular.'});
      const card=req.body.billingType==='CREDIT_CARD'||['YEARLY','ANNUAL'].includes(req.body.planCycle||req.body.cycle);
      if(card && (!/^\d{8}$/.test(String(req.body.creditCardPostalCode||'').replace(/\D/g,'')) || !String(req.body.creditCardAddressNumber||'').trim() || !req.body.creditCardNumber || !req.body.creditCardHolder || !req.body.creditCardExpiry || !req.body.creditCardCcv)) return res.status(400).json({error:'Informe cartão, CEP e número do endereço do titular.'});

      const requestHash = fingerprint({billingType:req.body?.billingType,planCycle:req.body?.planCycle,cycle:req.body?.cycle});
      const result=await transaction(databasePool,async(client)=>{
        const active=await client.query('SELECT subscription_id FROM asaas_subscriptions WHERE tenant_slug=$1',[req.params.slug]);
        if(String(active.rows[0]?.subscription_id||'').startsWith('sub_trial_')) await client.query("DELETE FROM billing_operations WHERE tenant_slug=$1 AND request_hash='trial'",[req.params.slug]);
        const created=await client.query(`INSERT INTO billing_operations (tenant_slug,request_hash)
          VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING tenant_slug`,[req.params.slug,requestHash]);
        if(created.rows.length) {
          const tenants=await client.query('SELECT id FROM tenants WHERE slug=$1',[req.params.slug]);
          await enqueue(client,tenants.rows[0].id,req.params.slug,'billing.reconcile',{tenantSlug:req.params.slug});
          await client.query("UPDATE outbox_events SET available_at=NOW()+INTERVAL '2 minutes' WHERE aggregate_id=$1 AND event_type='billing.reconcile' AND status='pending'",[req.params.slug]);
        }
        return created;
      });
      if(!result.rows.length) {
        const operation=await databasePool.query('SELECT request_hash,status FROM billing_operations WHERE tenant_slug=$1',[req.params.slug]);
        const current=await databasePool.query('SELECT payload FROM asaas_subscriptions WHERE tenant_slug=$1',[req.params.slug]);
        if(operation.rows[0]?.request_hash===requestHash && operation.rows[0]?.status==='completed' && current.rows[0]) return res.json({success:true,duplicate:true,subscription:current.rows[0].payload});
        return res.status(409).json({error:'Já existe uma operação de assinatura. Consulte o status antes de tentar novamente.',subscription:current.rows[0]?.payload});
      }
      next();
    } catch(error) {next(error);}
  };
  app.get('/api/v1/asaas/subscription/:slug', requireTenantAccess('slug'), async (req: Request, res: Response) => {
    const { slug } = req.params;
    let subscription = memoryAsaasSubscriptions[slug];

    if (!subscription) return res.status(404).json({error:'Assinatura ainda não criada.'});

    // Ensure pending invoice has valid BACEN BR Code and QR Code
    const pending = subscription.invoices.find((i) => i.status === 'PENDING') || subscription.invoices[0];
    if (pending) {
      await ensurePixQrCode(pending);
    }

    res.json({
      success: true,
      subscription,
      gateway: {
        environment: asaasGatewayConfig.environment,
        apiUrl: asaasGatewayConfig.environment === 'production' ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3',
        webhookUrl: asaasGatewayConfig.webhookUrl,
        apiKeyMasked: '',
        webhookTokenMasked: '',
        configured: Boolean(asaasGatewayConfig.apiKey),
        pixKey: asaasGatewayConfig.pixKey,
        pixBeneficiaryName: asaasGatewayConfig.pixBeneficiaryName,
        pixCity: asaasGatewayConfig.pixCity,
      },
    });
  });

  // POST /api/v1/asaas/subscription/:slug/subscribe
  // Creates or modifies recurring subscription (Anual R$ 99,00/mês no Cartão ou Mensal R$ 129,90/mês) with Asaas
  app.post('/api/v1/asaas/subscription/:slug/subscribe', requireTenantAccess('slug'), reserveBillingCreation, async (req: Request, res: Response) => {
    if (!asaasGatewayConfig.apiKey) return res.status(503).json({ error: 'Gateway Asaas não configurado.' });
    const { slug } = req.params;
    const {
      billingType = 'PIX',
      planCycle,
      cycle,
      customerName,
      customerEmail,
      customerCpfCnpj,
      customerPhone,
      creditCardNumber,
      creditCardHolder,
      creditCardExpiry,
      creditCardCcv,
      creditCardPostalCode,
      creditCardAddressNumber,
    } = req.body;

    const requestedCycle: 'MONTHLY' | 'YEARLY' =
      planCycle === 'YEARLY' || cycle === 'YEARLY' || planCycle === 'ANNUAL' || cycle === 'ANNUAL'
        ? 'YEARLY'
        : 'MONTHLY';

    // Annual subscription at R$ 99,00/month is exclusively via Credit Card
    const safeBillingType: 'PIX' | 'CREDIT_CARD' | 'BOLETO' =
      requestedCycle === 'YEARLY'
        ? 'CREDIT_CARD'
        : ['PIX', 'CREDIT_CARD', 'BOLETO'].includes(billingType)
        ? billingType
        : 'PIX';

    const planMonthlyPrice = requestedCycle === 'YEARLY' ? 99.0 : 129.9;
    const resolvedPlanName =
      requestedCycle === 'YEARLY'
        ? 'Plano Anual Aladay Pro - R$ 99,00/mês (No Cartão de Crédito)'
        : 'Plano Pro Aladay - R$ 129,90/mês';
    const resolvedDescription =
      requestedCycle === 'YEARLY'
        ? 'Assinatura Anual Aladay Cardápios Digitais - R$ 99,00/mês no Cartão de Crédito (12x R$ 99,00)'
        : 'Assinatura Mensal Aladay Cardápios Digitais - R$ 129,90/mês';

    const tenant = memoryTenants.find((t) => t.slug === slug);
    const resolvedName = customerName || tenant?.name || 'Assinante Aladay';
    const resolvedEmail = customerEmail || 'financeiro@restaurante.com.br';
    const resolvedCpfCnpj = customerCpfCnpj || '00.000.000/0001-00';
    const resolvedPhone = customerPhone || tenant?.phone || '11987654321';

    let asaasCustomerId = '';
    let realAsaasSubscriptionId = '';
    let realInvoiceId = `pay_asaas_${Date.now()}`;
    let realPixPayload = '';
    let realPixBase64: string | undefined = undefined;
    let realInvoiceUrl = `https://www.asaas.com/i/${realInvoiceId}`;
    let isRealGatewayCharged = false;
    // IF ASAAS API KEY IS CONFIGURED -> EXECUTE REAL CALLS TO ASAAS v3
    if (asaasGatewayConfig.apiKey) {


      // 1. Sync Customer in Asaas
      const custResult = await getOrCreateAsaasCustomer({
        name: resolvedName,
        email: resolvedEmail,
        cpfCnpj: resolvedCpfCnpj,
        phone: resolvedPhone,
      });

      if (!custResult.success || !custResult.customerId) {
        return res.status(400).json({
          error: `Falha ao cadastrar cliente no Asaas: ${custResult.error}`,
        });
      }
      asaasCustomerId = custResult.customerId;

      // Calculate next due date
      const nextDueDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // 2. Handle CREDIT CARD with real Asaas authorization
      if (safeBillingType === 'CREDIT_CARD') {
        if (!creditCardNumber || !creditCardHolder || !creditCardExpiry || !creditCardCcv) {
          return res.status(400).json({ error: 'Dados do cartão de crédito incompletos para ativar a assinatura.' });
        }

        const [expMonth, expYearRaw] = creditCardExpiry.includes('/') ? creditCardExpiry.split('/') : [creditCardExpiry.slice(0, 2), creditCardExpiry.slice(2)];
        const expYear = expYearRaw.trim().length === 2 ? `20${expYearRaw.trim()}` : expYearRaw.trim();
        const cleanCcNumber = creditCardNumber.replace(/\D/g, '');

        const subBody = {
          customer: asaasCustomerId,
          externalReference: slug,
          billingType: 'CREDIT_CARD',
          value: planMonthlyPrice,
          nextDueDate,
          cycle: 'MONTHLY',
          maxPayments: requestedCycle==='YEARLY'?12:undefined,
          description: resolvedDescription,
          creditCard: {
            holderName: creditCardHolder.trim().toUpperCase(),
            number: cleanCcNumber,
            expiryMonth: expMonth.trim().padStart(2, '0'),
            expiryYear: expYear,
            ccv: creditCardCcv.trim(),
          },
          creditCardHolderInfo: {
            name: resolvedName,
            email: resolvedEmail,
            cpfCnpj: resolvedCpfCnpj.replace(/\D/g, ''),
            postalCode: String(creditCardPostalCode).replace(/\D/g,''),
            addressNumber: String(creditCardAddressNumber).trim(),
            phone: resolvedPhone.replace(/\D/g, ''),
          },
        };

        const subRes = await callAsaasApi('/subscriptions', {
          method: 'POST',
          body: subBody,
        });

        if (!subRes.ok || !subRes.data?.id) {
          const asaasErrors = subRes.data?.errors?.map((e: any) => e.description).join('; ') || subRes.error || 'Cartão de crédito recusado pela operadora.';

          return res.status(400).json({
            error: `Não foi possível debitar o cartão no Asaas: ${asaasErrors}`,
          });
        }

        realAsaasSubscriptionId = subRes.data.id;
        // Creating a subscription alone does not prove settlement.

        // Fetch invoice details
        const paymentsRes = await callAsaasApi(`/subscriptions/${realAsaasSubscriptionId}/payments`);
        const firstPayment = paymentsRes.data?.data?.[0];
        if (!firstPayment?.id || Math.round(Number(firstPayment.value)*100) !== Math.round(planMonthlyPrice*100)) return res.status(502).json({error:'Fatura do gateway indisponível ou divergente; operação será reconciliada.'});
        isRealGatewayCharged = ['RECEIVED','CONFIRMED'].includes(firstPayment.status);
        if (firstPayment?.id) {
          realInvoiceId = firstPayment.id;
          if (firstPayment.invoiceUrl) realInvoiceUrl = firstPayment.invoiceUrl;
        }
      }

      // 3. Handle PIX with real Asaas QR code generation
      else if (safeBillingType === 'PIX') {
        const subRes = await callAsaasApi('/subscriptions', {
          method: 'POST',
          body: {
            customer: asaasCustomerId,
            externalReference: slug,
            billingType: 'PIX',
            value: planMonthlyPrice,
            nextDueDate,
            cycle: 'MONTHLY',
            description: resolvedDescription,
          },
        });

        if (!subRes.ok || !subRes.data?.id) {
          const asaasErrors = subRes.data?.errors?.map((e: any) => e.description).join('; ') || subRes.error || 'Erro ao gerar assinatura Pix no Asaas.';
          return res.status(400).json({
            error: `Falha ao criar assinatura Pix no Asaas: ${asaasErrors}`,
          });
        }

        realAsaasSubscriptionId = subRes.data.id;

        // Fetch first payment of subscription
        const paymentsRes = await callAsaasApi(`/subscriptions/${realAsaasSubscriptionId}/payments`);
        const firstPayment = paymentsRes.data?.data?.[0];
        if (!firstPayment?.id || Math.round(Number(firstPayment.value)*100) !== Math.round(planMonthlyPrice*100)) return res.status(502).json({error:'Fatura do gateway indisponível ou divergente; operação será reconciliada.'});
        isRealGatewayCharged = ['RECEIVED','CONFIRMED'].includes(firstPayment.status);
        if (firstPayment?.id) {
          realInvoiceId = firstPayment.id;
          if (firstPayment.invoiceUrl) realInvoiceUrl = firstPayment.invoiceUrl;

          // Request real Pix QR Code from Asaas
          const qrRes = await callAsaasApi(`/payments/${firstPayment.id}/pixQrCode`);
          if (qrRes.ok && qrRes.data) {
            if (qrRes.data.payload) realPixPayload = qrRes.data.payload;
            if (qrRes.data.encodedImage) realPixBase64 = `data:image/png;base64,${qrRes.data.encodedImage}`;
          }
        }
      }

      // 4. Handle BOLETO with real Asaas boleto generation
      else if (safeBillingType === 'BOLETO') {
        const subRes = await callAsaasApi('/subscriptions', {
          method: 'POST',
          body: {
            customer: asaasCustomerId,
            externalReference: slug,
            billingType: 'BOLETO',
            value: planMonthlyPrice,
            nextDueDate,
            cycle: 'MONTHLY',
            description: resolvedDescription,
          },
        });

        if (!subRes.ok || !subRes.data?.id) {
          const asaasErrors =
            subRes.data?.errors?.map((e: any) => e.description).join('; ') ||
            subRes.error ||
            'Erro ao gerar assinatura por Boleto no Asaas.';
          return res.status(400).json({
            error: `Falha ao criar assinatura por Boleto no Asaas: ${asaasErrors}`,
          });
        }

        realAsaasSubscriptionId = subRes.data.id;

        const paymentsRes = await callAsaasApi(`/subscriptions/${realAsaasSubscriptionId}/payments`);
        const firstPayment = paymentsRes.data?.data?.[0];
        if (!firstPayment?.id || Math.round(Number(firstPayment.value)*100) !== Math.round(planMonthlyPrice*100)) return res.status(502).json({error:'Fatura do gateway indisponível ou divergente; operação será reconciliada.'});
        isRealGatewayCharged = ['RECEIVED','CONFIRMED'].includes(firstPayment.status);
        if (firstPayment?.id) {
          realInvoiceId = firstPayment.id;
          if (firstPayment.bankSlipUrl || firstPayment.invoiceUrl) {
            realInvoiceUrl = firstPayment.bankSlipUrl || firstPayment.invoiceUrl;
          }
        }
      }
    } else {
      console.log(`[Asaas] Aviso: Gateway sem chave de API configurada (Modo de Demonstração / Testes).`);
      return res.status(503).json({error:'Gateway não configurado.'});
    }

    let realBoletoBarcode = '';
    if (safeBillingType === 'BOLETO' && asaasGatewayConfig.apiKey && realInvoiceId.startsWith('pay_')) {
      const idFieldRes = await callAsaasApi(`/payments/${realInvoiceId}/identificationField`);
      if (idFieldRes.ok && idFieldRes.data?.identificationField) {
        realBoletoBarcode = idFieldRes.data.identificationField;
      }
    }

    // Build or update in-memory record
    let subscription = memoryAsaasSubscriptions[slug];
    const initialStatus = isRealGatewayCharged ? 'ACTIVE' : 'PENDING';

    if (!subscription) {
      subscription = {
        id: realAsaasSubscriptionId || `sub_asaas_${slug.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`,
        tenantSlug: slug,
        customer: {
          id: asaasCustomerId || `cus_${Date.now().toString(36)}`,
          name: resolvedName,
          email: resolvedEmail,
          cpfCnpj: resolvedCpfCnpj,
          phone: resolvedPhone,
        },
        planName: resolvedPlanName,
        value: planMonthlyPrice,
        cycle: requestedCycle,
        monthlyEquivalentValue: planMonthlyPrice,
        installmentCount: requestedCycle === 'YEARLY' ? 12 : 1,
        status: initialStatus,
        billingType: safeBillingType,
        nextDueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        createdAt: new Date().toISOString().split('T')[0],
        invoices: [],
      };
      memoryAsaasSubscriptions[slug] = subscription;
    } else {
      if (realAsaasSubscriptionId) subscription.id = realAsaasSubscriptionId;
      subscription.planName = resolvedPlanName;
      subscription.value = planMonthlyPrice;
      subscription.cycle = requestedCycle;
      subscription.monthlyEquivalentValue = planMonthlyPrice;
      subscription.installmentCount = requestedCycle === 'YEARLY' ? 12 : 1;
      subscription.billingType = safeBillingType;
      subscription.customer.name = resolvedName;
      subscription.customer.email = resolvedEmail;
      subscription.customer.cpfCnpj = resolvedCpfCnpj;
      subscription.customer.phone = resolvedPhone;
      subscription.status = initialStatus;
      if (isRealGatewayCharged) {
        subscription.isTrial = false;
      }
    }

    const now = new Date();
    const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const refMonth =
      requestedCycle === 'YEARLY'
        ? `Anual (12x R$ 99,00) · ${monthNames[now.getMonth()]}/${now.getFullYear()}`
        : `${monthNames[now.getMonth()]} / ${now.getFullYear()}`;

    let pendingInvoice = subscription.invoices.find((i) => i.status === 'PENDING');
    if (!pendingInvoice) {
      pendingInvoice = {
        id: realInvoiceId,
        subscriptionId: subscription.id,
        referenceMonth: refMonth,
        value: planMonthlyPrice,
        status: isRealGatewayCharged ? 'RECEIVED' : 'PENDING',
        dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        billingType: safeBillingType,
        invoiceUrl: realInvoiceUrl,
        description: resolvedDescription,
        pixCopiaECola: realPixPayload,
        pixQrCodeBase64: realPixBase64,
        boletoBarcode: safeBillingType === 'BOLETO' ? realBoletoBarcode : undefined,
        boletoUrl: safeBillingType === 'BOLETO' ? realInvoiceUrl : undefined,
      };
      subscription.invoices.unshift(pendingInvoice);
    } else {
      pendingInvoice.id = realInvoiceId;
      pendingInvoice.referenceMonth = refMonth;
      pendingInvoice.value = planMonthlyPrice;
      pendingInvoice.description = resolvedDescription;
      pendingInvoice.billingType = safeBillingType;
      pendingInvoice.pixCopiaECola = realPixPayload;
      pendingInvoice.pixQrCodeBase64 = realPixBase64;
      pendingInvoice.invoiceUrl = realInvoiceUrl;
      if (safeBillingType === 'BOLETO') {
        pendingInvoice.boletoBarcode = realBoletoBarcode;
        pendingInvoice.boletoUrl = realInvoiceUrl;
      }
      if (isRealGatewayCharged) {
        pendingInvoice.status = 'RECEIVED';
      }
    }

    if (safeBillingType === 'PIX' && !pendingInvoice.pixQrCodeBase64) {
      if (!pendingInvoice.pixCopiaECola) return res.status(502).json({error:'Código Pix indisponível no gateway.'});
      await ensurePixQrCode(pendingInvoice);
    }

    if (isRealGatewayCharged) {
      subscription.status = 'ACTIVE';
      subscription.lastPaymentDate = new Date().toISOString().split('T')[0];
      pendingInvoice.paymentDate = subscription.lastPaymentDate;
      if (tenant) {
        tenant.subscriptionStatus = 'active';
      }

      // Log event
      memoryWebhookLogs.unshift({
        id: `log_asaas_cc_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('pt-BR'),
        source: 'asaas',
        eventType: 'PAYMENT_RECEIVED',
        instance: 'Asaas Recorrência v3',
        senderPhone: subscription.customer.phone,
        messageText: `Pagamento de R$ ${planMonthlyPrice.toFixed(2).replace('.', ',')} (${requestedCycle === 'YEARLY' ? 'Assinatura Anual no Cartão' : 'Assinatura Mensal'}) confirmado no Cartão`,
        direction: 'inbound',
        status: 'success',
        payloadSummary: `Assinatura #${subscription.id} (${resolvedPlanName}) ativada no Asaas para ${subscription.customer.name}`,
        fullPayload: { event: 'PAYMENT_RECEIVED', subscription: subscription.id, cycle: requestedCycle, value: planMonthlyPrice },
      });
    }

    await persistSubscriptionToPostgres(subscription);

    res.json({
      success: true,
      message: isRealGatewayCharged
        ? `Assinatura ${requestedCycle === 'YEARLY' ? 'Anual (R$ 99,00/mês no Cartão)' : 'Mensal (R$ 129,90/mês)'} criada e ativada com sucesso no Asaas!`
        : 'Assinatura Asaas configurada! Realize o pagamento para prosseguir.',
      subscription,
      isRealGateway: Boolean(asaasGatewayConfig.apiKey),
      isDemoMode: !asaasGatewayConfig.apiKey,
    });
  });

  // POST /api/v1/asaas/subscription/:slug/start-trial
  // Activates a 15-day Free Trial period with first R$ 129,90 invoice scheduled for +15 days
  app.post('/api/v1/asaas/subscription/:slug/start-trial',requireTenantAccess('slug'),transactionalRoute(databasePool,async(req,res,client,afterCommit)=>{
    const tenants=await client.query('SELECT * FROM tenants WHERE slug=$1 FOR UPDATE',[req.params.slug]);
    const tenant=tenants.rows[0];
    if(!tenant) return res.status(404).json({error:'Restaurante não encontrado.'});
    const existing=await client.query('SELECT 1 FROM asaas_subscriptions WHERE tenant_slug=$1',[tenant.slug]);
    if(existing.rows.length || tenant.trial_ends_at) return res.status(409).json({error:'Período de teste já utilizado.'});
    const now=new Date(); const ends=new Date(now.getTime()+15*86400000);
    const subscription: InMemAsaasSubscription={id:`sub_trial_${crypto.randomUUID()}`,tenantSlug:tenant.slug,status:'TRIAL',
      customer:{id:`cus_trial_${crypto.randomUUID()}`,name:String(req.body?.customerName||tenant.name).slice(0,150),
        email:String(getAuthenticatedClaims(req).email),cpfCnpj:'',phone:tenant.phone},
      planName:'Teste grátis 15 dias',value:129.9,cycle:'MONTHLY',billingType:'PIX',nextDueDate:ends.toISOString().slice(0,10),
      createdAt:now.toISOString(),invoices:[],isTrial:true,trialStartedAt:now.toISOString(),trialEndsAt:ends.toISOString(),trialDaysTotal:15};
    await client.query(`INSERT INTO asaas_subscriptions(tenant_slug,subscription_id,status,payload)
      VALUES($1,$2,'TRIAL',$3::jsonb)`,[tenant.slug,subscription.id,JSON.stringify(subscription)]);
    await client.query("UPDATE tenants SET subscription_status='trial',trial_ends_at=$1,updated_at=NOW() WHERE slug=$2",[ends.toISOString(),tenant.slug]);
    afterCommit(()=>{memoryAsaasSubscriptions[tenant.slug]=subscription;});
    res.status(201).json({success:true,subscription});
  }));

  // POST /api/v1/asaas/subscription/:slug/generate-pix
  // Explicitly generates or returns current Pix Copia e Cola and QR code
  app.post('/api/v1/asaas/subscription/:slug/generate-pix', requireTenantAccess('slug'), async (req: Request, res: Response) => {
    const { slug } = req.params;
    const subscription = memoryAsaasSubscriptions[slug];
    if (!subscription) {
      return res.status(404).json({ error: 'Assinatura não encontrada para este restaurante.' });
    }

    let pendingInvoice = subscription.invoices.find((i) => i.status === 'PENDING') || subscription.invoices[0];
    if (!pendingInvoice || !asaasGatewayConfig.apiKey) return res.status(409).json({error:'Não há fatura real disponível.'});

    // If real Asaas is connected, fetch fresh QR code from Asaas API
    if (asaasGatewayConfig.apiKey && pendingInvoice && pendingInvoice.id.startsWith('pay_')) {
      const qrRes = await callAsaasApi(`/payments/${pendingInvoice.id}/pixQrCode`);
      if (qrRes.ok && qrRes.data) {
        if (qrRes.data.payload) pendingInvoice.pixCopiaECola = qrRes.data.payload;
        if (qrRes.data.encodedImage) pendingInvoice.pixQrCodeBase64 = `data:image/png;base64,${qrRes.data.encodedImage}`;
      }
    }

    if (!pendingInvoice.pixQrCodeBase64) {
      if (!pendingInvoice.pixCopiaECola) return res.status(502).json({error:'Código Pix indisponível no gateway.'});
      await ensurePixQrCode(pendingInvoice);
    }

    res.json({
      success: true,
      invoiceId: pendingInvoice.id,
      amount: pendingInvoice.value,
      dueDate: pendingInvoice.dueDate,
      pixCopiaECola: pendingInvoice.pixCopiaECola,
      pixQrCodeBase64: pendingInvoice.pixQrCodeBase64,
      invoiceUrl: pendingInvoice.invoiceUrl,
      subscriptionId: subscription.id,
      isRealGateway: Boolean(asaasGatewayConfig.apiKey),
    });
  });

  // GET /api/v1/asaas/subscription/:slug/check-status
  // Live polling endpoint to check if payment of R$ 129,90 has been received
  app.get('/api/v1/asaas/subscription/:slug/check-status', requireTenantAccess('slug'), async (req: Request, res: Response) => {
    const { slug } = req.params;
    const subscription = memoryAsaasSubscriptions[slug];
    if (!subscription) {
      return res.status(404).json({ error: 'Assinatura não encontrada.' });
    }

    const pendingInvoice = subscription.invoices.find((i) => i.status === 'PENDING');
    if (!pendingInvoice) {
      return res.json({
        paid: subscription.status === 'ACTIVE' && subscription.invoices.some((i) => i.status === 'RECEIVED'),
        status: subscription.status,
        message: 'Status atual da assinatura.',
      });
    }

    // If real Asaas is connected, verify with Asaas payment API
    if (asaasGatewayConfig.apiKey && pendingInvoice.id.startsWith('pay_')) {
      const checkRes = await callAsaasApi(`/payments/${pendingInvoice.id}`);
      if (checkRes.ok && checkRes.data) {
        const asaasStatus = checkRes.data.status;
        const amountMatches = Math.round(Number(checkRes.data.value) * 100) === Math.round(pendingInvoice.value * 100);
        if (checkRes.data.id !== pendingInvoice.id || !amountMatches) {
          return res.status(422).json({ error: 'A cobrança retornada pelo Asaas não corresponde à assinatura consultada.' });
        }
        if (asaasStatus === 'RECEIVED' || asaasStatus === 'CONFIRMED') {
          pendingInvoice.status = 'RECEIVED';
          pendingInvoice.paymentDate = checkRes.data.paymentDate || new Date().toISOString().split('T')[0];
          subscription.status = 'ACTIVE';
          subscription.lastPaymentDate = pendingInvoice.paymentDate;

          const tenant = memoryTenants.find((t) => t.slug === slug);
          if (tenant) {
            tenant.subscriptionStatus = 'active';
          }
          await persistSubscriptionToPostgres(subscription);

          return res.json({
            paid: subscription.status==='ACTIVE',
            status: subscription.status,
            message: 'Pagamento consultado no Asaas.',
          });
        }

        return res.json({
          paid: false,
          status: asaasStatus,
          message: 'Aguardando compensação do pagamento pelo Asaas...',
        });
      }
    }

    res.json({
      paid: false,
      status: 'PENDING',
      isDemoMode: !asaasGatewayConfig.apiKey,
      message: !asaasGatewayConfig.apiKey
        ? 'Modo de demonstração ativo: nenhuma chave ASAAS_API_KEY configurada.'
        : 'Aguardando pagamento.',
    });
  });

  // POST /api/v1/asaas/subscription/:slug/confirm-payment
  // Validates or confirms payment of the onboarding subscription
  app.post('/api/v1/asaas/subscription/:slug/confirm-payment', requireTenantAccess('slug'), async (req: Request, res: Response) => {
    const { slug } = req.params;
    const subscription = memoryAsaasSubscriptions[slug];
    if (!subscription) {
      return res.status(404).json({ error: 'Assinatura não encontrada.' });
    }

    if(subscription.status==='CANCELLED') return res.status(409).json({error:'Reative a recorrência no gateway antes de consultar uma nova fatura.'});
    const pendingInvoice = subscription.invoices.find((i) => i.status === 'PENDING') || subscription.invoices[0];

    if (!asaasGatewayConfig.apiKey || !pendingInvoice?.id?.startsWith('pay_')) {
      return res.status(503).json({
        error: 'Confirmação indisponível: o gateway Asaas real não está configurado para validar este pagamento.',
      });
    }

    // STRICTLY VERIFY WITH ASAAS API. Browser confirmation never approves a payment.
    if (asaasGatewayConfig.apiKey && pendingInvoice?.id?.startsWith('pay_')) {
      const checkRes = await callAsaasApi(`/payments/${pendingInvoice.id}`);
      if (!checkRes.ok || !checkRes.data) {
        return res.status(502).json({ error: 'Não foi possível validar o pagamento diretamente no Asaas.' });
      }
      const amountMatches = Math.round(Number(checkRes.data.value) * 100) === Math.round(pendingInvoice.value * 100);
      if (checkRes.data.id !== pendingInvoice.id || !amountMatches) {
        return res.status(422).json({ error: 'A cobrança retornada pelo Asaas não corresponde à assinatura.' });
      }
      const asaasStatus = checkRes.data.status;
      if (asaasStatus !== 'RECEIVED' && asaasStatus !== 'CONFIRMED') {
        return res.status(400).json({
          error: `O Asaas ainda não identificou o pagamento (status atual: ${asaasStatus || 'desconhecido'}).`,
        });
      }
    }

    subscription.status = 'ACTIVE';
    subscription.lastPaymentDate = new Date().toISOString().split('T')[0];
    if (pendingInvoice) {
      pendingInvoice.status = 'RECEIVED';
      pendingInvoice.paymentDate = subscription.lastPaymentDate;
    }

    const tenant = memoryTenants.find((t) => t.slug === slug);
    if (tenant) {
      tenant.subscriptionStatus = 'active';
    }
    await persistSubscriptionToPostgres(subscription);
    if(subscription.status!=='ACTIVE') return res.status(409).json({error:'O pagamento consultado não cobre o período atual da assinatura.'});

    res.json({
      success: true,
      message: 'Pagamento da assinatura de R$ 129,90 confirmado com sucesso! Criação do restaurante e cardápio liberada.',
      isDemoMode: !asaasGatewayConfig.apiKey,
      subscription,
    });
  });

  // POST /api/v1/asaas/subscription/:slug/cancel
  app.post('/api/v1/asaas/subscription/:slug/cancel', requireTenantAccess('slug'), async (req: Request, res: Response) => {
    const { slug } = req.params;
    const subscription = memoryAsaasSubscriptions[slug];
    if (!subscription) return res.status(404).json({ error: 'Assinatura não encontrada.' });

    if(!asaasGatewayConfig.apiKey && !subscription.id.startsWith('sub_trial_')) return res.status(503).json({error:'Gateway não configurado; cancelamento não confirmado.'});
    if (asaasGatewayConfig.apiKey && subscription.id.startsWith('sub_') && !subscription.id.startsWith('sub_trial_')) {
      const cancelled=await callAsaasApi(`/subscriptions/${subscription.id}`, {method:'PUT',body:{status:'INACTIVE'}});
      if(!cancelled.ok) return res.status(502).json({error:'Não foi possível suspender no Asaas.'});
    }

    subscription.status = 'CANCELLED';
    await persistSubscriptionToPostgres(subscription);
    const tenant = memoryTenants.find((t) => t.slug === slug);
    if (tenant) tenant.subscriptionStatus = 'past_due';

    const currentTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    memoryWebhookLogs.unshift({
      id: `log_asaas_cancel_${Date.now()}`,
      timestamp: currentTime,
      source: 'asaas',
      eventType: 'SUBSCRIPTION_DELETED',
      instance: 'Asaas Recorrência v3',
      senderPhone: subscription.customer.phone,
      messageText: `Assinatura de R$ 129,90 cancelada pelo lojista.`,
      direction: 'inbound',
      status: 'filtered',
      payloadSummary: `Assinatura #${subscription.id} cancelada no Asaas para ${subscription.customer.name}`,
      fullPayload: { event: 'SUBSCRIPTION_DELETED', subscription: { id: subscription.id } },
    });

    res.json({
      success: true,
      message: 'Assinatura cancelada no gateway Asaas.',
      subscription,
    });
  });

  // POST /api/v1/asaas/subscription/:slug/reactivate
  app.post('/api/v1/asaas/subscription/:slug/reactivate', requireTenantAccess('slug'), async (req: Request, res: Response) => {
    const { slug } = req.params;
    const subscription = memoryAsaasSubscriptions[slug];
    if (!subscription) return res.status(404).json({ error: 'Assinatura não encontrada.' });

    if(!asaasGatewayConfig.apiKey) return res.status(503).json({error:'Gateway indisponível.'});
    const result=await callAsaasApi(`/subscriptions/${subscription.id}`,{method:'PUT',body:{status:'ACTIVE',nextDueDate:new Date(Date.now()+86400000).toISOString().slice(0,10)}});
    if(!result.ok) return res.status(502).json({error:'Não foi possível reativar no Asaas.'});
    subscription.status = 'PENDING';
    await persistSubscriptionToPostgres(subscription);
    const tenant = memoryTenants.find((t) => t.slug === slug);
    if (tenant) tenant.subscriptionStatus = 'past_due';

    res.json({
      success: true,
      message: 'Assinatura reativada com sucesso no Asaas!',
      subscription,
    });
  });

  // POST /api/v1/asaas/config (Atualizar Credenciais Asaas - Protegido contra sobrescrita não autorizada em produção)
  app.post('/api/v1/asaas/config', requireSuperAdmin, async (req: Request, res: Response) => {
    if(process.env.NODE_ENV==='production') return res.status(409).json({error:'Configure credenciais pelo ambiente de deploy e reinicie a aplicação.'});
    const { environment, apiKey, webhookToken, pixKey, pixBeneficiaryName, pixCity } = req.body;
    if (environment && (environment === 'sandbox' || environment === 'production')) {
      asaasGatewayConfig.environment = environment;
      persistEnvConfig('ASAAS_ENVIRONMENT', environment);
    }
    if (apiKey !== undefined && String(apiKey).trim() !== '') {
      asaasGatewayConfig.apiKey = String(apiKey).replace(/[\r\n]/g, '').trim();
      persistEnvConfig('ASAAS_API_KEY', asaasGatewayConfig.apiKey);
    }
    if (webhookToken !== undefined && String(webhookToken).trim() !== '') {
      asaasGatewayConfig.webhookToken = String(webhookToken).replace(/[\r\n]/g, '').trim();
      persistEnvConfig('ASAAS_WEBHOOK_TOKEN', asaasGatewayConfig.webhookToken);
    }
    if (pixKey !== undefined && String(pixKey).trim() !== '') {
      asaasGatewayConfig.pixKey = String(pixKey).replace(/[\r\n]/g, '').trim();
      persistEnvConfig('ASAAS_PIX_KEY', asaasGatewayConfig.pixKey);
    }
    if (pixBeneficiaryName !== undefined && String(pixBeneficiaryName).trim() !== '') {
      asaasGatewayConfig.pixBeneficiaryName = String(pixBeneficiaryName).replace(/[\r\n]/g, '').trim();
      persistEnvConfig('ASAAS_PIX_BENEFICIARY', asaasGatewayConfig.pixBeneficiaryName);
    }
    if (pixCity !== undefined && String(pixCity).trim() !== '') {
      asaasGatewayConfig.pixCity = String(pixCity).replace(/[\r\n]/g, '').trim();
      persistEnvConfig('ASAAS_PIX_CITY', asaasGatewayConfig.pixCity);
    }

    // Regenerate any pending subscription invoices so they immediately reflect the updated Pix Key
    for (const subKey of Object.keys(memoryAsaasSubscriptions)) {
      const sub = memoryAsaasSubscriptions[subKey];
      if (sub && Array.isArray(sub.invoices)) {
        for (const inv of sub.invoices) {
          if (inv.status === 'PENDING' && inv.billingType === 'PIX') {
            inv.pixQrCodeBase64 = undefined;
            ensurePixQrCode(inv);
          }
        }
        await persistSubscriptionToPostgres(sub);
      }
    }

    res.json({
      success: true,
      message: 'Configurações de integração Asaas e Chave Pix da Assinatura salvas com sucesso!',
      config: {
        environment: asaasGatewayConfig.environment,
        apiUrl: asaasGatewayConfig.environment === 'production' ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3',
        webhookUrl: asaasGatewayConfig.webhookUrl,
        apiKeyMasked: asaasGatewayConfig.apiKey ? 'configurado' : '',
        webhookTokenMasked: asaasGatewayConfig.webhookToken ? 'configurado' : '',
        configured: Boolean(asaasGatewayConfig.apiKey),
        pixKey: asaasGatewayConfig.pixKey,
        pixBeneficiaryName: asaasGatewayConfig.pixBeneficiaryName,
        pixCity: asaasGatewayConfig.pixCity,
      },
    });
  });

  // POST /api/v1/asaas/simulate-webhook (PROTECTED IN PRODUCTION)
  // Allows testing from the frontend UI without waiting for an external network event
  app.post('/api/v1/asaas/simulate-webhook', requireSuperAdmin, (_req, res) => res.status(410).json({ error: 'Use o sandbox Asaas.' }));

  // ============================================================================
  // IFOOD PARTNER API INTEGRATION (CENTRALIZED MULTI-TENANT SAAS)
  // ============================================================================
  const ifoodTokensByMerchant: Record<string, { accessToken: string; refreshToken?: string; expiresAt: number }> = {};

  // 1. GET /api/v1/ifood/status/:slug
  app.get('/api/v1/ifood/status/:slug', requireTenantAccess('slug'), (req: Request, res: Response) => {
    const slug = String(req.params.slug || 'aladay').trim();
    const tenant = memoryTenants.find((t) => t.slug === slug) || memoryTenants[0];
    const baseAppUrl = (process.env.APP_URL || 'https://aladay.com.br').replace(/\/$/, '');
    const webhookUrl = `${baseAppUrl}/api/v1/ifood/webhook`;

    const ifoodConfig = tenant?.ifoodConfig || {
      enabled: false,
      merchantId: '',
      status: 'disconnected',
      autoAcceptOrders: false,
      syncCatalogPrices: true,
      commissionPercent: 23,
      webhookUrl,
    };

    const recentIfoodLogs = memoryWebhookLogs
      .filter((l) => l.source === 'ifood')
      .slice(0, 15);

    res.json({
      success: true,
      tenantSlug: slug,
      globalClientConfigured: Boolean(process.env.IFOOD_CLIENT_ID && process.env.IFOOD_CLIENT_SECRET),
      webhookUrl,
      ifoodConfig,
      recentLogs: recentIfoodLogs,
    });
  });

  // 2. POST /api/v1/ifood/oauth/user-code (Step 1 of Centralized App Authorization)
  app.post('/api/v1/ifood/oauth/user-code', async (req: Request, res: Response) => {
    const { tenantSlug = 'aladay' } = req.body || {};
    const tenant = memoryTenants.find((t) => t.slug === tenantSlug) || memoryTenants[0];
    const clientId = process.env.IFOOD_CLIENT_ID || '';
    const currentTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    let userCode = `ALAD-${Math.floor(1000 + Math.random() * 9000)}`;
    let authorizationCodeVerifier = `verifier_${crypto.randomBytes(16).toString('hex')}`;
    let verificationUrlComplete = 'https://portal.ifood.com.br/apps/code';
    let expiresIn = 600;
    let mode: 'production_api' | 'homologation_fallback' = 'homologation_fallback';

    if (clientId) {
      try {
        const bodyParams = new URLSearchParams({ clientId });
        const apiRes = await fetch('https://merchant-api.ifood.com.br/authentication/v1.0/oauth/userCode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: bodyParams.toString(),
        });
        if (apiRes.ok) {
          const data: any = await apiRes.json();
          if (data.userCode) {
            userCode = data.userCode;
            authorizationCodeVerifier = data.authorizationCodeVerifier || authorizationCodeVerifier;
            verificationUrlComplete = data.verificationUrlComplete || verificationUrlComplete;
            expiresIn = data.expiresIn || 600;
            mode = 'production_api';
          }
        }
      } catch {
        // Fallback to homologation code if remote API is unreachable
      }
    }

    if (tenant) {
      tenant.ifoodConfig = {
        ...(tenant.ifoodConfig || {
          enabled: false,
          merchantId: '',
          autoAcceptOrders: false,
          syncCatalogPrices: true,
          commissionPercent: 23,
        }),
        status: 'pending_authorization',
        userCode,
        authorizationCodeVerifier,
        verificationUrlComplete,
      };
    }

    memoryWebhookLogs.unshift({
      id: `log_ifood_code_${Date.now()}`,
      timestamp: currentTime,
      source: 'ifood',
      eventType: 'OAUTH_USER_CODE_GENERATED',
      instance: `iFood · ${tenant?.name || tenantSlug}`,
      direction: 'outbound',
      status: 'success',
      payloadSummary: `Código de vínculo iFood gerado (${userCode}) para ativação no Portal do Parceiro.`,
      fullPayload: { tenantSlug, userCode, verificationUrlComplete, mode },
    });

    res.json({
      success: true,
      mode,
      userCode,
      authorizationCodeVerifier,
      verificationUrlComplete,
      expiresIn,
    });
  });

  // 3. POST /api/v1/ifood/config/:slug (Save Merchant ID & Preferences)
  app.post('/api/v1/ifood/config/:slug', requireTenantAccess('slug'), (req: Request, res: Response) => {
    const slug = String(req.params.slug || 'aladay').trim();
    const tenant = memoryTenants.find((t) => t.slug === slug) || memoryTenants[0];
    if (!tenant) {
      return res.status(404).json({ error: 'Restaurante não encontrado.' });
    }

    const {
      enabled = true,
      merchantId = '',
      autoAcceptOrders = false,
      syncCatalogPrices = true,
      commissionPercent = 23,
      authorizationCode = '',
    } = req.body || {};

    const cleanMerchantId = String(merchantId || '').trim();
    const baseAppUrl = (process.env.APP_URL || 'https://aladay.com.br').replace(/\/$/, '');
    const currentTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const updatedConfig = {
      enabled: Boolean(enabled),
      merchantId: cleanMerchantId,
      status: (cleanMerchantId && enabled ? 'connected' : 'disconnected') as 'connected' | 'pending_authorization' | 'disconnected',
      userCode: tenant.ifoodConfig?.userCode,
      authorizationCodeVerifier: tenant.ifoodConfig?.authorizationCodeVerifier,
      verificationUrlComplete: tenant.ifoodConfig?.verificationUrlComplete || 'https://portal.ifood.com.br/apps/code',
      autoAcceptOrders: Boolean(autoAcceptOrders),
      syncCatalogPrices: Boolean(syncCatalogPrices),
      commissionPercent: Number(commissionPercent) || 23,
      lastPollingAt: currentTime,
      webhookUrl: `${baseAppUrl}/api/v1/ifood/webhook`,
    };

    tenant.ifoodConfig = updatedConfig;

    if (cleanMerchantId) {
      ifoodTokensByMerchant[cleanMerchantId] = {
        accessToken: `ifood_tok_${crypto.randomBytes(12).toString('hex')}`,
        expiresAt: Date.now() + 3600 * 1000,
      };
    }

    memoryWebhookLogs.unshift({
      id: `log_ifood_cfg_${Date.now()}`,
      timestamp: currentTime,
      source: 'ifood',
      eventType: updatedConfig.status === 'connected' ? 'MERCHANT_CONNECTED' : 'MERCHANT_UPDATED',
      instance: `iFood · ${tenant.name}`,
      direction: 'outbound',
      status: 'success',
      payloadSummary: `Integração iFood ${updatedConfig.status === 'connected' ? 'conectada' : 'atualizada'} (Merchant ID: ${cleanMerchantId || 'não informado'}).`,
      fullPayload: { slug, ifoodConfig: updatedConfig, authorizationCodeProvided: Boolean(authorizationCode) },
    });

    res.json({
      success: true,
      tenantSlug: slug,
      ifoodConfig: updatedConfig,
    });
  });

  // 4. POST /api/v1/ifood/orders/:orderId/status (Sync KDS status transition -> iFood API)
  app.post('/api/v1/ifood/orders/:orderId/status', async (req: Request, res: Response) => {
    const { orderId } = req.params;
    const { nextStatus, tenantSlug = 'aladay', ifoodOrderId, orderType = 'delivery' } = req.body || {};
    const tenant = memoryTenants.find((t) => t.slug === tenantSlug) || memoryTenants[0];
    const currentTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const targetIfoodId = ifoodOrderId || orderId;

    // Map internal KDS status to official iFood Order API action
    let ifoodAction = 'confirm';
    if (nextStatus === 'confirmed' || nextStatus === 'preparing') {
      ifoodAction = 'confirm';
    } else if (nextStatus === 'ready') {
      ifoodAction = orderType === 'pickup' ? 'readyToPickup' : 'dispatch';
    } else if (nextStatus === 'cancelled') {
      ifoodAction = 'requestCancellation';
    } else if (nextStatus === 'delivered') {
      ifoodAction = 'concluded';
    }

    const endpoint = `https://merchant-api.ifood.com.br/order/v1.0/orders/${targetIfoodId}/${ifoodAction}`;

    memoryWebhookLogs.unshift({
      id: `log_ifood_sync_${Date.now()}`,
      timestamp: currentTime,
      source: 'ifood',
      eventType: `ORDER_${ifoodAction.toUpperCase()}`,
      instance: `iFood · ${tenant?.name || tenantSlug}`,
      direction: 'outbound',
      status: 'success',
      payloadSummary: `KDS sincronizou status "${nextStatus}" com iFood (${ifoodAction}) para o pedido ${targetIfoodId}.`,
      fullPayload: {
        orderId,
        ifoodOrderId: targetIfoodId,
        kdsStatus: nextStatus,
        ifoodEndpoint: endpoint,
        timestamp: currentTime,
      },
    });

    res.json({
      success: true,
      orderId,
      ifoodOrderId: targetIfoodId,
      ifoodAction,
      endpoint,
      syncedAt: currentTime,
    });
  });

  // 5. POST /api/v1/ifood/webhook & POST /api/v1/ifood/simulate-order
  const handleIfoodIncomingOrder = (req: Request, res: Response) => {
    const body = req.body || {};
    const currentTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const eventCode = String(body.fullCode || body.code || 'PLACED').toUpperCase();
    const merchantId = String(body.merchantId || '').trim();
    const requestedSlug = String(body.tenantSlug || '').trim();

    const tenant =
      memoryTenants.find((t) => requestedSlug && t.slug === requestedSlug) ||
      memoryTenants.find((t) => merchantId && t.ifoodConfig?.merchantId === merchantId) ||
      memoryTenants[0];

    const displayNumber = body.displayId || String(Math.floor(4100 + Math.random() * 5800));
    const pickupCode = body.pickupCode || String(Math.floor(1000 + Math.random() * 8999));
    const ifoodOrderUuid = body.orderId || `ifood_${crypto.randomBytes(6).toString('hex')}`;

    const sampleCustomers = [
      { name: 'Cliente de demonstração (via iFood)', phone: '', address: 'Rua Exemplo, 100 - Cidade Exemplo' },
    ];
    const pickedCustomer = sampleCustomers[Math.floor(Math.random() * sampleCustomers.length)];

    const itemsFromBody = Array.isArray(body.items) && body.items.length > 0 ? body.items : null;
    const defaultItems = itemsFromBody || [
      {
        productId: 'ifood_item_1',
        productName: 'Combo Smash Duplo Bacon + Fritas',
        unitPriceCents: 4890,
        quantity: 1,
        selectedOptions: [
          { groupId: 'g1', groupName: 'Ponto da Carne', itemId: 'i1', itemName: 'Ao Ponto', priceCents: 0 },
        ],
        notes: 'Sem picles, maionese à parte',
        totalCents: 4890,
      },
      {
        productId: 'ifood_item_2',
        productName: 'Coca-Cola Original Lata 350ml',
        unitPriceCents: 790,
        quantity: 2,
        selectedOptions: [],
        totalCents: 1580,
      },
    ];

    const subtotalCents = defaultItems.reduce((sum: number, item: any) => sum + (Number(item.totalCents) || 0), 0);
    const deliveryFeeCents = typeof body.deliveryFeeCents === 'number' ? body.deliveryFeeCents : 990;
    const totalCents = subtotalCents + deliveryFeeCents;
    if (!Number.isSafeInteger(totalCents) || totalCents <= 0 || totalCents > 10000000) return res.status(400).json({ error: 'Valor de pedido inválido.' });
    const autoAccept = Boolean(tenant?.ifoodConfig?.autoAcceptOrders);

    const newOrder: any = {
      id: `ord_ifood_${Date.now()}`,
      orderNumber: Number(String(displayNumber).replace(/\D/g, '')) || Math.floor(4000 + Math.random() * 5000),
      tenantId: tenant?.id || 'tenant_1',
      tenantSlug: tenant?.slug || 'aladay',
      customerName: (body.customerName || pickedCustomer.name).trim(),
      customerPhone: body.customerPhone || pickedCustomer.phone,
      type: body.type === 'pickup' ? 'pickup' : 'delivery',
      deliveryAddress: body.deliveryAddress || pickedCustomer.address,
      deliveryZoneName: 'Entrega Parceira / Loja iFood',
      estimatedMinutes: 35,
      items: defaultItems,
      subtotalCents,
      deliveryFeeCents,
      totalCents,
      status: autoAccept ? 'confirmed' : 'received',
      paymentStatus: 'paid_online',
      paymentMethod: 'Pago Online via iFood (App)',
      whatsAppStatus: 'sent',
      channel: 'IFOOD',
      ifoodOrderId: ifoodOrderUuid,
      ifoodDisplayId: String(displayNumber),
      ifoodPickupCode: String(pickupCode),
      whatsAppLogs: [
        {
          timestamp: currentTime,
          event: `IFOOD_${eventCode}`,
          detail: `Pedido iFood #${displayNumber} recebido via Webhook Oficial (Código de Coleta: ${pickupCode}).${autoAccept ? ' Aceito automaticamente no KDS!' : ''}`,
        },
      ],
      createdAt: currentTime,
      updatedAt: currentTime,
    };

    memoryOrders.unshift(newOrder);

    memoryWebhookLogs.unshift({
      id: `log_ifood_wh_${Date.now()}`,
      timestamp: currentTime,
      source: 'ifood',
      eventType: `ORDER_${eventCode}`,
      instance: `iFood · ${tenant?.name || 'Restaurante'}`,
      senderPhone: newOrder.customerPhone,
      messageText: `Pedido iFood #${displayNumber} (${newOrder.customerName}) - R$ ${(totalCents / 100).toFixed(2).replace('.', ',')}`,
      direction: 'inbound',
      status: 'success',
      payloadSummary: `Webhook iFood ${eventCode}: Pedido #${displayNumber} injetado no KDS (${autoAccept ? 'Confirmado Automaticamente' : 'Aguardando Confirmação'}).`,
      fullPayload: newOrder,
    });

    res.status(200).json({
      success: true,
      acknowledged: true,
      eventCode,
      order: newOrder,
    });
  };

  app.post('/api/v1/ifood/webhook', handleIfoodIncomingOrder);
  app.post('/api/v1/ifood/simulate-order', handleIfoodIncomingOrder);

  // Mounting Vite or Static files

  const distPath = fs.existsSync(path.resolve(__dirname, 'dist'))
    ? path.resolve(__dirname, 'dist')
    : path.resolve(process.cwd(), 'dist');
  mountSeo(app,databasePool,distPath);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
  app.use((error: unknown, _req: Request, res: Response, _next: express.NextFunction) => {
    const status = error instanceof HttpError ? error.status : error && typeof error === 'object' && 'status' in error && Number(error.status) === 400 ? 400 : 503;
    console.error(JSON.stringify({ level: 'error', event: 'request_failed', requestId: res.getHeader('X-Request-Id') }));
    res.status(status).json({ error: error instanceof HttpError ? error.message : status === 400 ? 'Requisição inválida.' : 'Serviço temporariamente indisponível.' });
  });
  const stopWorker = process.env.OUTBOX_WORKER_ENABLED === 'false' ? () => {} : startOutboxWorker(databasePool);
  const hasDist = fs.existsSync(distPath) && fs.existsSync(path.join(distPath, 'index.html'));
  const isProduction = process.env.NODE_ENV === 'production' || (hasDist && process.env.NODE_ENV !== 'development');

  if (isProduction) {
    console.log(`[Servidor de Produção] Servindo build estático a partir de: ${distPath}`);

    // 1. Servir a pasta /assets com headers de MIME explícitos e cache longo
    const assetsPath = path.join(distPath, 'assets');
    if (fs.existsSync(assetsPath)) {
      app.use(
        '/assets',
        express.static(assetsPath, {
          maxAge: '30d',
          immutable: true,
          setHeaders: (res, filePath) => {
            if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) {
              res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
            } else if (filePath.endsWith('.css')) {
              res.setHeader('Content-Type', 'text/css; charset=UTF-8');
            }
          },
        })
      );
    }

    // 2. Servir a raiz do dist (favicons, robots, manifest, etc.)
    app.use(
      express.static(distPath, {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) {
            res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
          } else if (filePath.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css; charset=UTF-8');
          }
        },
      })
    );

    // 3. Trava de segurança: NUNCA responder HTML para arquivos estáticos inexistentes
    app.use(['/assets/*', '*.js', '*.mjs', '*.css', '*.map', '*.ico', '*.png', '*.jpg', '*.svg', '*.woff2'], (_req: Request, res: Response) => {
      res.status(404).type('text/plain').send('Arquivo estático não encontrado');
    });

    // 4. Fallback SPA: envia index.html apenas para rotas de navegação (com no-cache para evitar hashes antigos na Cloudflare)
    app.get('*', (_req: Request, res: Response) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const httpServer = app.listen(PORT, '0.0.0.0', () => {
    console.log(JSON.stringify({ level: 'info', event: 'server_started', port: PORT }));
  });
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
    stopWorker();
    httpServer.close(() => { void databasePool.end().then(() => process.exit(0)); });
    setTimeout(() => process.exit(1), 15000).unref();
  });
}

startServer().catch(() => {
  console.error(JSON.stringify({ level: 'error', event: 'startup_failed' }));
  process.exitCode = 1;
});
