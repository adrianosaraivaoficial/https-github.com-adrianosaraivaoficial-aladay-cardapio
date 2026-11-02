import React, { useState } from 'react';
import { FinancialCalculator } from './components/FinancialCalculator';
import { ConsumerMenuView } from './components/ConsumerMenuView';
import { RestaurantAdminView } from './components/RestaurantAdminView';
import { TechDiagramsView } from './components/TechDiagramsView';
import { ProjectKickoffView } from './components/ProjectKickoffView';
import { OrderTrackingView } from './components/OrderTrackingView';
import {
  INITIAL_CATEGORIES,
  INITIAL_CUSTOMERS,
  INITIAL_ORDERS,
  INITIAL_PRODUCTS,
  INITIAL_TENANT,
  INITIAL_TENANTS_LIST,
  PIZZARIA_CATEGORIES,
  PIZZARIA_PRODUCTS,
} from './data/mockTenant';
import {
  AuthSession,
  Category,
  CustomerRecord,
  LegacyTenantCatalog,
  NormalizedTenantCatalog,
  Order,
  OrderStatus,
  Product,
  RestaurantTenant,
} from './types';
import { BLUEPRINT_SECTIONS } from './data/blueprintSections';
import { LogIn, Lock, ShieldAlert, X, ArrowRight, Menu, Share2, Copy, Check, MessageSquare, ExternalLink } from 'lucide-react';
import { WhatsAppAutomationView } from './components/WhatsAppAutomationView';
import { AuthPortalView } from './components/AuthPortalView';
import { LandingPageView } from './components/LandingPageView';
import { LegalComplianceView } from './components/LegalComplianceView';

const CATALOG_PARTITION_PREFIX = 'aladay_prod_catalog_v3_';
const CATALOG_INDEX_KEY = 'aladay_prod_catalog_index_v3';
const LEGACY_CATALOGS_KEY = 'aladay_prod_catalogs_v2';

const DEFAULT_NUMERIC_CATEGORY_NAMES: Record<string, string> = {
  '1': 'Lanches & Burgers',
  '2': 'Porções & Entradas',
  '3': 'Bebidas',
  '4': 'Sobremesas',
};

/**
 * Memoized string normalization helper to avoid repeated Unicode NFD regex passes
 * when indexing large catalogs across tenants.
 */
function normalizeCatalogKey(value: string, cache: Map<string, string>): string {
  const existing = cache.get(value);
  if (existing !== undefined) return existing;
  const normalized = value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  cache.set(value, normalized);
  return normalized;
}

/**
 * Normalizes and repairs a single tenant's catalog in linear O(C + P + O) time.
 * Supports both LegacyTenantCatalog (flat arrays) and NormalizedTenantCatalog (v3 indexed maps).
 * Builds O(1) lookup tables (`categoriesById`, `productsById`, `ordersById`) and
 * secondary category-to-products index (`productIdsByCategory`) for scalable mutations.
 */
export function sanitizeTenantCatalog(
  rawTenantData: Partial<LegacyTenantCatalog & NormalizedTenantCatalog> | null | undefined,
  normCache: Map<string, string> = new Map()
): NormalizedTenantCatalog {
  const now = Date.now();
  if (!rawTenantData) {
    return {
      schemaVersion: 3,
      categoriesById: {},
      categoryIds: [],
      productsById: {},
      productIds: [],
      productIdsByCategory: {},
      ordersById: {},
      orderIds: [],
      updatedAt: now,
    };
  }

  // Extract raw arrays whether input is already v3 normalized or legacy flat arrays
  const sourceCategories: Category[] = Array.isArray(rawTenantData.categories)
    ? rawTenantData.categories
    : rawTenantData.categoriesById && Array.isArray(rawTenantData.categoryIds)
    ? rawTenantData.categoryIds
        .map((id) => rawTenantData.categoriesById![id])
        .filter((c): c is Category => Boolean(c))
    : rawTenantData.categoriesById
    ? Object.values(rawTenantData.categoriesById)
    : [];

  const sourceProducts: Product[] = Array.isArray(rawTenantData.products)
    ? rawTenantData.products
    : rawTenantData.productsById && Array.isArray(rawTenantData.productIds)
    ? rawTenantData.productIds
        .map((id) => rawTenantData.productsById![id])
        .filter((p): p is Product => Boolean(p))
    : rawTenantData.productsById
    ? Object.values(rawTenantData.productsById)
    : [];

  const sourceOrders: Order[] = Array.isArray(rawTenantData.orders)
    ? rawTenantData.orders
    : rawTenantData.ordersById && Array.isArray(rawTenantData.orderIds)
    ? rawTenantData.orderIds
        .map((id) => rawTenantData.ordersById![id])
        .filter((o): o is Order => Boolean(o))
    : rawTenantData.ordersById
    ? Object.values(rawTenantData.ordersById)
    : [];

  const catMapByNorm = new Map<string, Category>();
  const idRemap = new Map<string, string>();
  const numericCategories: Category[] = [];

  // Single pass over categories: partition non-numeric vs numeric-only categories
  for (let i = 0; i < sourceCategories.length; i++) {
    const cat = sourceCategories[i];
    if (!cat || !cat.id) continue;
    const trimmed = (cat.name || '').trim();
    if (/^\d+$/.test(trimmed)) {
      numericCategories.push(cat);
    } else {
      const safeName = trimmed || 'Geral';
      const norm = normalizeCatalogKey(safeName, normCache);
      const existing = catMapByNorm.get(norm);
      if (!existing) {
        catMapByNorm.set(norm, { ...cat, name: safeName });
      } else if (cat.id !== existing.id) {
        idRemap.set(cat.id, existing.id);
      }
    }
  }

  // Repair numeric-only categories ("1", "2", "3", "4")
  for (let i = 0; i < numericCategories.length; i++) {
    const cat = numericCategories[i];
    const trimmed = (cat.name || '').trim();
    const numOrder = parseInt(trimmed, 10) || cat.order || 1;
    const mappedName = DEFAULT_NUMERIC_CATEGORY_NAMES[trimmed] || `Categoria ${trimmed}`;
    const norm = normalizeCatalogKey(mappedName, normCache);
    const existing = catMapByNorm.get(norm);
    if (existing) {
      if (cat.id !== existing.id) {
        idRemap.set(cat.id, existing.id);
      }
    } else {
      catMapByNorm.set(norm, {
        ...cat,
        name: mappedName,
        order: numOrder,
      });
    }
  }

  const candidateCategoriesById = new Map<string, Category>();
  catMapByNorm.forEach((cat) => {
    candidateCategoriesById.set(cat.id, cat);
  });

  // Single O(P) pass over products: deduplicate by ID, remap categoryId, and populate category buckets
  const productsById: Record<string, Product> = {};
  const productIds: string[] = [];
  const productIdsByCategory: Record<string, string[]> = {};

  candidateCategoriesById.forEach((cat) => {
    productIdsByCategory[cat.id] = [];
  });

  let fallbackCategoryId: string | null = null;

  for (let i = 0; i < sourceProducts.length; i++) {
    const rawProd = sourceProducts[i];
    if (!rawProd || !rawProd.id) continue;

    let resolvedCategoryId = idRemap.get(rawProd.categoryId) || rawProd.categoryId;

    // Ensure orphan products are never lost if their categoryId was missing
    if (!candidateCategoriesById.has(resolvedCategoryId)) {
      if (!fallbackCategoryId) {
        const firstExisting = candidateCategoriesById.keys().next().value as string | undefined;
        if (firstExisting) {
          fallbackCategoryId = firstExisting;
        } else {
          fallbackCategoryId = 'cat_default_1';
          const fallbackCat: Category = {
            id: fallbackCategoryId,
            name: 'Pratos Principais',
            order: 1,
          };
          candidateCategoriesById.set(fallbackCategoryId, fallbackCat);
          productIdsByCategory[fallbackCategoryId] = [];
        }
      }
      resolvedCategoryId = fallbackCategoryId;
    }

    const isNewProduct = !(rawProd.id in productsById);
    const normalizedProd: Product =
      resolvedCategoryId === rawProd.categoryId
        ? rawProd
        : { ...rawProd, categoryId: resolvedCategoryId };

    productsById[rawProd.id] = normalizedProd;
    if (isNewProduct) {
      productIds.push(rawProd.id);
      if (!productIdsByCategory[resolvedCategoryId]) {
        productIdsByCategory[resolvedCategoryId] = [];
      }
      productIdsByCategory[resolvedCategoryId].push(rawProd.id);
    }
  }

  // O(C) filtering of empty default placeholder categories using O(1) bucket length check
  const allUniqueCats = Array.from(candidateCategoriesById.values());
  const nonEmptyOrOnlyCats =
    allUniqueCats.length > 2
      ? allUniqueCats.filter((c) => {
          const count = productIdsByCategory[c.id]?.length ?? 0;
          if (count > 0) return true;
          const norm = normalizeCatalogKey(c.name, normCache);
          return norm !== 'pratos principais' && norm !== 'geral';
        })
      : allUniqueCats;

  const finalCategories = (nonEmptyOrOnlyCats.length > 0 ? nonEmptyOrOnlyCats : allUniqueCats)
    .sort((a, b) => a.order - b.order)
    .map((c, idx) => ({ ...c, order: idx + 1 }));

  const categoriesById: Record<string, Category> = {};
  const categoryIds: string[] = [];
  const cleanedProductIdsByCategory: Record<string, string[]> = {};

  for (let i = 0; i < finalCategories.length; i++) {
    const cat = finalCategories[i];
    categoriesById[cat.id] = cat;
    categoryIds.push(cat.id);
    cleanedProductIdsByCategory[cat.id] = productIdsByCategory[cat.id] || [];
  }

  // Single O(O) pass over orders
  const ordersById: Record<string, Order> = {};
  const orderIds: string[] = [];
  for (let i = 0; i < sourceOrders.length; i++) {
    const ord = sourceOrders[i];
    if (!ord || !ord.id) continue;
    if (!(ord.id in ordersById)) {
      orderIds.push(ord.id);
    }
    ordersById[ord.id] = ord;
  }

  return {
    schemaVersion: 3,
    categoriesById,
    categoryIds,
    productsById,
    productIds,
    productIdsByCategory: cleanedProductIdsByCategory,
    ordersById,
    orderIds,
    updatedAt: rawTenantData.updatedAt || now,
  };
}

/**
 * Sanitizes and indexes an entire multi-tenant catalog dictionary in O(T * (C + P + O)) time.
 * Accepts both legacy v2 `{ categories, products, orders }` and v3 `NormalizedTenantCatalog` entries.
 */
export function sanitizeCatalogData(
  rawCatalog: Record<string, Partial<LegacyTenantCatalog & NormalizedTenantCatalog>>
): Record<string, NormalizedTenantCatalog> {
  const normCache = new Map<string, string>();
  const cleaned: Record<string, NormalizedTenantCatalog> = {};

  if (!rawCatalog || typeof rawCatalog !== 'object') {
    return cleaned;
  }

  const entries = Object.entries(rawCatalog);
  for (let i = 0; i < entries.length; i++) {
    const [slug, data] = entries[i];
    if (!slug) continue;
    cleaned[slug] = sanitizeTenantCatalog(data, normCache);
  }

  return cleaned;
}

/**
 * Converts a NormalizedTenantCatalog back into a compact LegacyTenantCatalog snapshot
 * when needed for backward compatibility or API export.
 */
function materializeLegacyCatalog(catalog: NormalizedTenantCatalog): LegacyTenantCatalog {
  return {
    categories: catalog.categoryIds
      .map((id) => catalog.categoriesById[id])
      .filter((c): c is Category => Boolean(c)),
    products: catalog.productIds
      .map((id) => catalog.productsById[id])
      .filter((p): p is Product => Boolean(p)),
    orders: catalog.orderIds
      .map((id) => catalog.ordersById[id])
      .filter((o): o is Order => Boolean(o)),
  };
}

/**
 * Persists a single tenant's normalized catalog partition to localStorage,
 * avoiding full-store serialization of untouched tenants.
 */
function persistSingleTenantCatalogPartition(
  slug: string,
  catalog: NormalizedTenantCatalog
): void {
  try {
    localStorage.setItem(`${CATALOG_PARTITION_PREFIX}${slug}`, JSON.stringify(catalog));
    const rawIndex = localStorage.getItem(CATALOG_INDEX_KEY);
    const currentIndex: string[] = rawIndex ? JSON.parse(rawIndex) : [];
    if (!currentIndex.includes(slug)) {
      currentIndex.push(slug);
      localStorage.setItem(CATALOG_INDEX_KEY, JSON.stringify(currentIndex));
    }
  } catch {
    // ignore storage quota errors
  }
}

/**
 * Hydrates a single tenant partition from localStorage if available.
 */
function hydrateSingleTenantCatalogPartition(slug: string): NormalizedTenantCatalog | null {
  try {
    const rawPartition = localStorage.getItem(`${CATALOG_PARTITION_PREFIX}${slug}`);
    if (rawPartition) {
      return sanitizeTenantCatalog(JSON.parse(rawPartition));
    }
  } catch {
    // ignore corrupted partition
  }
  return null;
}

export default function App() {
  const sharedLojaParam = React.useMemo(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('loja');
  }, []);

  const [currentView, setCurrentView] = useState<'home' | 'kickoff' | 'consumer' | 'admin' | 'calculator' | 'diagrams' | 'tracking' | 'whatsapp' | 'auth' | 'terms' | 'privacy'>(() =>
    sharedLojaParam ? 'consumer' : 'home'
  );
  const [selectedTrackingOrder, setSelectedTrackingOrder] = useState<Order | null>(null);
  const [showSubscriptionNoticeModal, setShowSubscriptionNoticeModal] = useState<boolean>(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [topMenuLinkCopied, setTopMenuLinkCopied] = useState<boolean>(false);

  const [authSession, setAuthSession] = useState<AuthSession | null>(() => {
    try {
      const saved = localStorage.getItem('aladay_auth_session');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const normalizeTenantVisualIdentity = (t: RestaurantTenant): RestaurantTenant => {
    if (
      t.slug === 'aladay' &&
      (t.primaryColor === '#EA580C' || t.primaryColor === '#059669' || !t.primaryColor)
    ) {
      return {
        ...t,
        primaryColor: '#2563EB',
        backgroundColor: '#F8FAFC',
      };
    }
    return t;
  };

  // Shared state between consumer cardápio and restaurant admin (persisted in localStorage)
  const [tenantsList, setTenantsList] = useState<RestaurantTenant[]>(() => {
    try {
      const saved = localStorage.getItem('aladay_prod_tenants_list_v2');
      const list: RestaurantTenant[] = saved ? JSON.parse(saved) : INITIAL_TENANTS_LIST;
      return list.map(normalizeTenantVisualIdentity);
    } catch {
      return INITIAL_TENANTS_LIST;
    }
  });

  const [tenant, setTenant] = useState<RestaurantTenant>(() => {
    try {
      const savedList: RestaurantTenant[] = (
        JSON.parse(localStorage.getItem('aladay_prod_tenants_list_v2') || 'null') ||
        INITIAL_TENANTS_LIST
      ).map(normalizeTenantVisualIdentity);
      if (sharedLojaParam) {
        const matchedBySlug = savedList.find(
          (t) => t.slug.toLowerCase() === sharedLojaParam.toLowerCase()
        );
        if (matchedBySlug) return matchedBySlug;
      }
      const saved = localStorage.getItem('aladay_prod_tenant_v2');
      return saved ? normalizeTenantVisualIdentity(JSON.parse(saved)) : INITIAL_TENANT;
    } catch {
      return INITIAL_TENANT;
    }
  });

  // Tracks which tenant slugs have pending catalog mutations for incremental persistence
  const dirtyTenantSlugsRef = React.useRef<Set<string>>(new Set());

  const markTenantCatalogDirty = React.useCallback((slug: string) => {
    if (slug) {
      dirtyTenantSlugsRef.current.add(slug);
    }
  }, []);

  // Normalized Catalogs indexed by tenant slug (Multi-tenancy isolated & partitioned state)
  const [catalogsByTenant, setCatalogsByTenant] = useState<
    Record<string, NormalizedTenantCatalog>
  >(() => {
    const normCache = new Map<string, string>();
    const hydrated: Record<string, NormalizedTenantCatalog> = {};

    try {
      // 1. Load from v3 per-tenant partitions if index exists
      const rawIndex = localStorage.getItem(CATALOG_INDEX_KEY);
      if (rawIndex) {
        const indexedSlugs: string[] = JSON.parse(rawIndex);
        if (Array.isArray(indexedSlugs)) {
          for (let i = 0; i < indexedSlugs.length; i++) {
            const slug = indexedSlugs[i];
            const partition = hydrateSingleTenantCatalogPartition(slug);
            if (partition) {
              hydrated[slug] = partition;
            }
          }
        }
      }

      // 2. Migrate any legacy v2 monolithic catalogs not yet in v3 partitions
      const legacySaved = localStorage.getItem(LEGACY_CATALOGS_KEY);
      if (legacySaved) {
        const sanitizedLegacy = sanitizeCatalogData(JSON.parse(legacySaved));
        Object.entries(sanitizedLegacy).forEach(([slug, normalizedCat]) => {
          if (!hydrated[slug]) {
            hydrated[slug] = normalizedCat;
            persistSingleTenantCatalogPartition(slug, normalizedCat);
          }
        });
      }
    } catch {
      // ignore storage read errors
    }

    // 3. Ensure default initial tenants are always seeded
    if (!hydrated[INITIAL_TENANT.slug]) {
      const defaultInitial = sanitizeTenantCatalog(
        {
          categories: INITIAL_CATEGORIES,
          products: INITIAL_PRODUCTS,
          orders: INITIAL_ORDERS,
        },
        normCache
      );
      hydrated[INITIAL_TENANT.slug] = defaultInitial;
      persistSingleTenantCatalogPartition(INITIAL_TENANT.slug, defaultInitial);
    }

    if (!hydrated['pizzaria-napoli']) {
      const defaultPizzaria = sanitizeTenantCatalog(
        {
          categories: PIZZARIA_CATEGORIES,
          products: PIZZARIA_PRODUCTS,
          orders: [],
        },
        normCache
      );
      hydrated['pizzaria-napoli'] = defaultPizzaria;
      persistSingleTenantCatalogPartition('pizzaria-napoli', defaultPizzaria);
    }

    return hydrated;
  });

  const [customers, setCustomers] = useState<CustomerRecord[]>(() => {
    try {
      const saved = localStorage.getItem('aladay_prod_customers_v2');
      return saved ? JSON.parse(saved) : INITIAL_CUSTOMERS;
    } catch {
      return INITIAL_CUSTOMERS;
    }
  });

  // Domain-isolated persistence effects to prevent unrelated state changes from serializing the catalog
  React.useEffect(() => {
    try {
      localStorage.setItem('aladay_prod_tenant_v2', JSON.stringify(tenant));
    } catch {
      // ignore storage quota errors
    }
  }, [tenant]);

  React.useEffect(() => {
    try {
      localStorage.setItem('aladay_prod_tenants_list_v2', JSON.stringify(tenantsList));
    } catch {
      // ignore storage quota errors
    }
  }, [tenantsList]);

  React.useEffect(() => {
    try {
      localStorage.setItem('aladay_prod_customers_v2', JSON.stringify(customers));
    } catch {
      // ignore storage quota errors
    }
  }, [customers]);

  // Debounced, incremental per-tenant catalog persistence
  React.useEffect(() => {
    const flushDirtyCatalogPartitions = () => {
      const dirtySlugs = Array.from(dirtyTenantSlugsRef.current);
      if (dirtySlugs.length === 0) return;
      dirtyTenantSlugsRef.current.clear();

      for (let i = 0; i < dirtySlugs.length; i++) {
        const slug = dirtySlugs[i];
        const tenantCatalog = catalogsByTenant[slug];
        if (tenantCatalog) {
          persistSingleTenantCatalogPartition(slug, tenantCatalog);
        }
      }

      // Maintain lightweight legacy v2 snapshot compatibility
      try {
        const legacySnapshot: Record<string, LegacyTenantCatalog> = {};
        Object.entries(catalogsByTenant).forEach(([slug, normCat]) => {
          legacySnapshot[slug] = materializeLegacyCatalog(normCat);
        });
        localStorage.setItem(LEGACY_CATALOGS_KEY, JSON.stringify(legacySnapshot));
      } catch {
        // ignore quota errors on legacy fallback key
      }
    };

    const timerId = window.setTimeout(flushDirtyCatalogPartitions, 150);
    window.addEventListener('beforeunload', flushDirtyCatalogPartitions);

    return () => {
      window.clearTimeout(timerId);
      window.removeEventListener('beforeunload', flushDirtyCatalogPartitions);
    };
  }, [catalogsByTenant]);

  // Synchronize and refresh JWT session with backend if a token exists
  React.useEffect(() => {
    if (!authSession?.token) return;
    fetch('/api/v1/auth/session', {
      headers: { Authorization: `Bearer ${authSession.token}` },
    })
      .then((res) => {
        if (res && res.status === 401) {
          handleLogout();
          return null;
        }
        return res && res.ok ? res.json() : null;
      })
      .then((data) => {
        if (data && data.success && data.token) {
          setAuthSession((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              token: data.token,
              user: data.user || prev.user,
              claims: data.claims || prev.claims,
            };
          });
        }
      })
      .catch(() => {});
  }, [authSession?.token]);

  // ===========================================================================
  // SCRIPT DE VERIFICAÇÃO: EXPIRAÇÃO DOS 15 DIAS DE TESTE GRÁTIS & ASSINATURA ASAAS
  // Bloqueia o acesso aos painéis de Admin e Cardápio Digital de qualquer tenant
  // que tenha expirado os 15 dias de teste grátis e ainda não possua assinatura ativa no Asaas.
  // ===========================================================================
  const TRIAL_DURATION_MS = 15 * 24 * 60 * 60 * 1000;
  const [verificationClockMs, setVerificationClockMs] = useState<number>(() => Date.now());

  // Revalida o relógio de expiração periodicamente em tempo de execução
  React.useEffect(() => {
    const interval = setInterval(() => {
      setVerificationClockMs(Date.now());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Sincroniza o status real da assinatura do tenant junto à API do Asaas no backend
  React.useEffect(() => {
    if (!tenant?.slug) return;
    let isMounted = true;

    fetch(`/api/v1/asaas/subscription/${encodeURIComponent(tenant.slug)}`)
      .then((res) => (res && res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted || !data?.subscription) return;
        const remoteSub = data.subscription;
        setTenant((prev) => {
          if (prev.slug !== tenant.slug) return prev;
          const prevStatus = prev.asaasSubscription?.status;
          const prevTrialEnds = prev.asaasSubscription?.trialEndsAt;
          if (
            prevStatus === remoteSub.status &&
            prevTrialEnds === remoteSub.trialEndsAt &&
            prev.asaasSubscription?.id === remoteSub.id
          ) {
            return prev;
          }
          const updated: RestaurantTenant = {
            ...prev,
            asaasSubscription: remoteSub,
            trialEndsAt: remoteSub.trialEndsAt || prev.trialEndsAt,
            subscriptionStatus:
              remoteSub.status === 'ACTIVE'
                ? 'active'
                : remoteSub.status === 'TRIAL'
                ? 'trial'
                : remoteSub.status === 'OVERDUE' || remoteSub.status === 'CANCELLED'
                ? 'past_due'
                : prev.subscriptionStatus,
          };
          setTenantsList((list) =>
            list.map((t) => (t.slug === updated.slug ? updated : t))
          );
          return updated;
        });
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [tenant?.slug]);

  const verifyTenantTrialAndAsaasSubscription = React.useCallback(
    (targetTenant: RestaurantTenant | null | undefined, nowMs: number) => {
      if (!targetTenant) {
        return {
          hasActiveAsaasSubscription: false,
          isTenantOnTrial: false,
          isTrialActiveAndValid: false,
          isTrialExpired: true,
          isTrialExpiredWithoutAsaas: true,
          trialDaysLeft: 0,
          trialEndsIso: undefined as string | undefined,
          blockReason: 'missing_tenant' as const,
        };
      }

      const asaasSub = targetTenant.asaasSubscription;

      // 1. Verifica se possui assinatura paga e ativa no Asaas
      const hasPaidAsaasInvoice = Boolean(
        asaasSub?.invoices?.some(
          (inv) => inv.status === 'RECEIVED' || inv.status === 'CONFIRMED'
        )
      );
      const hasActiveAsaasSubscription = Boolean(
        (asaasSub?.status === 'ACTIVE' && !asaasSub?.isTrial) ||
          (asaasSub?.status === 'ACTIVE' && hasPaidAsaasInvoice) ||
          (targetTenant.subscriptionStatus === 'active' &&
            asaasSub?.status === 'ACTIVE' &&
            !asaasSub?.isTrial)
      );

      // 2. Calcula a data limite dos 15 dias de teste grátis
      const rawTrialEndsIso = asaasSub?.trialEndsAt || targetTenant.trialEndsAt;
      const rawTrialStartIso = asaasSub?.trialStartedAt || asaasSub?.createdAt;

      let resolvedTrialEndsMs: number | null = null;
      if (rawTrialEndsIso) {
        const parsedEnd = new Date(rawTrialEndsIso).getTime();
        if (!Number.isNaN(parsedEnd)) {
          resolvedTrialEndsMs = parsedEnd;
        }
      } else if (rawTrialStartIso) {
        const parsedStart = new Date(rawTrialStartIso).getTime();
        if (!Number.isNaN(parsedStart)) {
          resolvedTrialEndsMs = parsedStart + TRIAL_DURATION_MS;
        }
      }

      const isTenantOnTrial = Boolean(
        asaasSub?.status === 'TRIAL' ||
          asaasSub?.isTrial ||
          targetTenant.subscriptionStatus === 'trial' ||
          Boolean(rawTrialEndsIso)
      );

      // Se a data de término do trial já passou (>= 15 dias), o período gratuito expirou
      const hasTrialDatePassed =
        resolvedTrialEndsMs !== null ? nowMs >= resolvedTrialEndsMs : false;

      const trialDaysLeft =
        isTenantOnTrial && resolvedTrialEndsMs !== null
          ? Math.max(0, Math.ceil((resolvedTrialEndsMs - nowMs) / (1000 * 60 * 60 * 24)))
          : isTenantOnTrial && !hasTrialDatePassed
          ? 15
          : 0;

      const isExplicitlyOverdueOrSuspended = Boolean(
        targetTenant.subscriptionStatus === 'past_due' ||
          targetTenant.subscriptionStatus === 'suspended' ||
          asaasSub?.status === 'OVERDUE' ||
          asaasSub?.status === 'CANCELLED'
      );

      const isTrialExpired = Boolean(
        (isTenantOnTrial && (hasTrialDatePassed || trialDaysLeft <= 0)) ||
          isExplicitlyOverdueOrSuspended
      );

      const isTrialActiveAndValid = Boolean(
        isTenantOnTrial && !isTrialExpired && trialDaysLeft > 0
      );

      // Bloqueia qualquer tenant que tenha expirado os 15 dias de teste grátis
      // e ainda não possua uma assinatura ativa no Asaas
      const isTrialExpiredWithoutAsaas = Boolean(
        isTrialExpired && !hasActiveAsaasSubscription
      );

      return {
        hasActiveAsaasSubscription,
        isTenantOnTrial,
        isTrialActiveAndValid,
        isTrialExpired,
        isTrialExpiredWithoutAsaas,
        trialDaysLeft,
        trialEndsIso:
          rawTrialEndsIso ||
          (resolvedTrialEndsMs ? new Date(resolvedTrialEndsMs).toISOString() : undefined),
        blockReason: isTrialExpiredWithoutAsaas
          ? ('trial_expired_no_asaas' as const)
          : !hasActiveAsaasSubscription && !isTrialActiveAndValid
          ? ('no_active_subscription' as const)
          : null,
      };
    },
    [TRIAL_DURATION_MS]
  );

  const tenantVerification = React.useMemo(
    () => verifyTenantTrialAndAsaasSubscription(tenant, verificationClockMs),
    [tenant, verificationClockMs, verifyTenantTrialAndAsaasSubscription]
  );

  // Atualiza automaticamente o status do tenant para 'past_due' / 'OVERDUE' caso os 15 dias tenham expirado sem Asaas ativo
  React.useEffect(() => {
    if (
      tenant &&
      tenantVerification.isTrialExpiredWithoutAsaas &&
      (tenant.subscriptionStatus === 'trial' ||
        tenant.asaasSubscription?.status === 'TRIAL')
    ) {
      setTenant((prev) => {
        const updated: RestaurantTenant = {
          ...prev,
          subscriptionStatus: 'past_due',
          asaasSubscription: prev.asaasSubscription
            ? { ...prev.asaasSubscription, status: 'OVERDUE' }
            : prev.asaasSubscription,
        };
        setTenantsList((list) =>
          list.map((t) => (t.slug === updated.slug ? updated : t))
        );
        return updated;
      });
    }
  }, [tenant, tenantVerification.isTrialExpiredWithoutAsaas]);

  const isSuperAdmin = authSession?.user?.role === 'SUPER_ADMIN';
  const isTenantStaffOrOwner =
    authSession?.user?.role === 'TENANT_OWNER' ||
    authSession?.user?.role === 'KITCHEN_STAFF';

  const trialDaysLeft = tenantVerification.trialDaysLeft;
  const isTrialActiveAndValid = tenantVerification.isTrialActiveAndValid;
  const isTrialExpiredWithoutAsaas = tenantVerification.isTrialExpiredWithoutAsaas;

  // O tenant só é considerado habilitado se NÃO estiver com o teste de 15 dias expirado sem Asaas ativo,
  // e possuir assinatura ativa no Asaas ou período de teste grátis de 15 dias vigente
  const isTenantSubscribed = Boolean(
    !isTrialExpiredWithoutAsaas &&
      (tenantVerification.hasActiveAsaasSubscription || isTrialActiveAndValid)
  );

  const hasActiveSubscription = Boolean(
    !isTrialExpiredWithoutAsaas &&
      (isSuperAdmin || (Boolean(authSession) && isTenantStaffOrOwner && isTenantSubscribed))
  );

  // Verifica se a visualização atual é um painel bloqueável (Admin, WhatsApp, Cardápio Digital ou Tracking)
  const isProtectedAdminOrMenuPanel =
    currentView === 'admin' ||
    currentView === 'whatsapp' ||
    currentView === 'consumer' ||
    currentView === 'tracking' ||
    currentView === 'calculator' ||
    currentView === 'diagrams';

  // O acesso público ao cardápio (?loja=slug) também é BLOQUEADO caso o tenant tenha expirado os 15 dias de teste
  // grátis e ainda não possua assinatura ativa no Asaas
  const isAllowedPublicStoreView = Boolean(
    sharedLojaParam &&
      (currentView === 'consumer' || currentView === 'tracking') &&
      isTenantSubscribed &&
      !isTrialExpiredWithoutAsaas
  );

  React.useEffect(() => {
    if (
      (isTrialExpiredWithoutAsaas || (!hasActiveSubscription && !isAllowedPublicStoreView)) &&
      isProtectedAdminOrMenuPanel
    ) {
      setCurrentView('home');
      setShowSubscriptionNoticeModal(true);
    }
  }, [
    isTrialExpiredWithoutAsaas,
    hasActiveSubscription,
    isAllowedPublicStoreView,
    isProtectedAdminOrMenuPanel,
  ]);

  const handleNavigateSafely = (targetView: typeof currentView) => {
    const isTargetProtected =
      targetView === 'admin' ||
      targetView === 'whatsapp' ||
      targetView === 'consumer' ||
      targetView === 'tracking' ||
      targetView === 'calculator' ||
      targetView === 'diagrams';

    if (
      isTargetProtected &&
      (isTrialExpiredWithoutAsaas || !hasActiveSubscription)
    ) {
      setCurrentView('home');
      setShowSubscriptionNoticeModal(true);
      return;
    }
    setCurrentView(targetView);
  };

  // Default fallback normalized catalog memoized once
  const defaultNormalizedCatalog = React.useMemo(
    () =>
      sanitizeTenantCatalog({
        categories: INITIAL_CATEGORIES,
        products: INITIAL_PRODUCTS,
        orders: [],
      }),
    []
  );

  // Derived current tenant data with memoized O(N) materialization only when the relevant slice changes
  const currentCatalog = catalogsByTenant[tenant.slug] || defaultNormalizedCatalog;

  const categories = React.useMemo(
    () =>
      currentCatalog.categoryIds
        .map((id) => currentCatalog.categoriesById[id])
        .filter((c): c is Category => Boolean(c)),
    [currentCatalog.categoryIds, currentCatalog.categoriesById]
  );

  const products = React.useMemo(
    () =>
      currentCatalog.productIds
        .map((id) => currentCatalog.productsById[id])
        .filter((p): p is Product => Boolean(p)),
    [currentCatalog.productIds, currentCatalog.productsById]
  );

  const orders = React.useMemo(
    () =>
      currentCatalog.orderIds
        .map((id) => currentCatalog.ordersById[id])
        .filter((o): o is Order => Boolean(o)),
    [currentCatalog.orderIds, currentCatalog.ordersById]
  );

  // Tenant Handlers
  const handleTenantCreated = (newTenant: RestaurantTenant) => {
    const initialNormalized = sanitizeTenantCatalog({
      categories: [
        { id: `cat_${Date.now()}_1`, name: 'Pratos Principais', order: 1 },
        { id: `cat_${Date.now()}_2`, name: 'Bebidas', order: 2 },
      ],
      products: [],
      orders: [],
    });

    setTenantsList((prev) => [...prev, newTenant]);
    markTenantCatalogDirty(newTenant.slug);
    setCatalogsByTenant((prev) => ({
      ...prev,
      [newTenant.slug]: initialNormalized,
    }));
    setTenant(newTenant);
  };

  const handleUpdateTenant = (updatedTenant: RestaurantTenant) => {
    setTenant(updatedTenant);
    setTenantsList((prev) =>
      prev.map((t) => (t.slug === updatedTenant.slug ? updatedTenant : t))
    );
  };

  const handleSelectTenant = (selected: RestaurantTenant) => {
    // Lazy on-demand partition hydration if tenant catalog is not yet in memory
    setCatalogsByTenant((prev) => {
      if (prev[selected.slug]) return prev;
      const hydrated = hydrateSingleTenantCatalogPartition(selected.slug);
      if (hydrated) {
        return { ...prev, [selected.slug]: hydrated };
      }
      return prev;
    });
    setTenant(selected);
  };

  const handleSessionAuthenticated = (newSession: AuthSession) => {
    setAuthSession(newSession);
    try {
      localStorage.setItem('aladay_auth_session', JSON.stringify(newSession));
    } catch {
      // ignore
    }
    if (newSession.user.tenantSlug !== '*') {
      const matched = tenantsList.find((t) => t.slug === newSession.user.tenantSlug);
      if (matched) {
        handleSelectTenant(matched);
      }
    }
  };

  const handleLogout = () => {
    setAuthSession(null);
    try {
      localStorage.removeItem('aladay_auth_session');
    } catch {
      // ignore
    }
    setCurrentView('home');
  };

  // Product & Category Handlers (O(1) Indexed Mutations Scoped to Current Tenant)
  const handleAddProduct = (newProduct: Product) => {
    markTenantCatalogDirty(tenant.slug);
    setCatalogsByTenant((prev) => {
      const existing = prev[tenant.slug] || defaultNormalizedCatalog;
      const isAlreadyPresent = Boolean(existing.productsById[newProduct.id]);
      const catId = newProduct.categoryId;
      const existingCatBucket = existing.productIdsByCategory[catId] || [];

      return {
        ...prev,
        [tenant.slug]: {
          ...existing,
          productsById: {
            ...existing.productsById,
            [newProduct.id]: newProduct,
          },
          productIds: isAlreadyPresent
            ? existing.productIds
            : [newProduct.id, ...existing.productIds],
          productIdsByCategory: {
            ...existing.productIdsByCategory,
            [catId]: isAlreadyPresent
              ? existingCatBucket
              : [newProduct.id, ...existingCatBucket],
          },
          updatedAt: Date.now(),
        },
      };
    });
  };

  const handleUpdateProduct = (updatedProduct: Product) => {
    markTenantCatalogDirty(tenant.slug);
    setCatalogsByTenant((prev) => {
      const existing = prev[tenant.slug] || defaultNormalizedCatalog;
      const previousProduct = existing.productsById[updatedProduct.id];
      if (!previousProduct) {
        return prev;
      }

      let nextProductIdsByCategory = existing.productIdsByCategory;
      if (previousProduct.categoryId !== updatedProduct.categoryId) {
        const oldCatId = previousProduct.categoryId;
        const newCatId = updatedProduct.categoryId;
        const oldBucket = (existing.productIdsByCategory[oldCatId] || []).filter(
          (id) => id !== updatedProduct.id
        );
        const newBucket = existing.productIdsByCategory[newCatId] || [];
        nextProductIdsByCategory = {
          ...existing.productIdsByCategory,
          [oldCatId]: oldBucket,
          [newCatId]: newBucket.includes(updatedProduct.id)
            ? newBucket
            : [updatedProduct.id, ...newBucket],
        };
      }

      return {
        ...prev,
        [tenant.slug]: {
          ...existing,
          productsById: {
            ...existing.productsById,
            [updatedProduct.id]: updatedProduct,
          },
          productIdsByCategory: nextProductIdsByCategory,
          updatedAt: Date.now(),
        },
      };
    });
  };

  const handleDeleteProduct = (productId: string) => {
    markTenantCatalogDirty(tenant.slug);
    setCatalogsByTenant((prev) => {
      const existing = prev[tenant.slug] || defaultNormalizedCatalog;
      const target = existing.productsById[productId];
      if (!target) return prev;

      const nextProductsById = { ...existing.productsById };
      delete nextProductsById[productId];

      const catId = target.categoryId;
      const nextCatBucket = (existing.productIdsByCategory[catId] || []).filter(
        (id) => id !== productId
      );

      return {
        ...prev,
        [tenant.slug]: {
          ...existing,
          productsById: nextProductsById,
          productIds: existing.productIds.filter((id) => id !== productId),
          productIdsByCategory: {
            ...existing.productIdsByCategory,
            [catId]: nextCatBucket,
          },
          updatedAt: Date.now(),
        },
      };
    });
  };

  // O(1) direct hash-map lookup and availability toggle without iterating over product list
  const handleToggleProductAvailability = (productId: string) => {
    markTenantCatalogDirty(tenant.slug);
    setCatalogsByTenant((prev) => {
      const existing = prev[tenant.slug] || defaultNormalizedCatalog;
      const target = existing.productsById[productId];
      if (!target) return prev;

      return {
        ...prev,
        [tenant.slug]: {
          ...existing,
          productsById: {
            ...existing.productsById,
            [productId]: {
              ...target,
              isAvailable: !target.isAvailable,
            },
          },
          updatedAt: Date.now(),
        },
      };
    });
  };

  const handleAddCategory = (categoryName: string) => {
    markTenantCatalogDirty(tenant.slug);
    setCatalogsByTenant((prev) => {
      const existing = prev[tenant.slug] || defaultNormalizedCatalog;
      const newCat: Category = {
        id: `cat_${Date.now()}`,
        name: categoryName.trim(),
        order: existing.categoryIds.length + 1,
      };
      return {
        ...prev,
        [tenant.slug]: {
          ...existing,
          categoriesById: {
            ...existing.categoriesById,
            [newCat.id]: newCat,
          },
          categoryIds: [...existing.categoryIds, newCat.id],
          productIdsByCategory: {
            ...existing.productIdsByCategory,
            [newCat.id]: [],
          },
          updatedAt: Date.now(),
        },
      };
    });
  };

  const handleImportCatalog = (
    newCategories: Category[],
    newProducts: Product[],
    mode: 'merge' | 'replace'
  ) => {
    markTenantCatalogDirty(tenant.slug);
    setCatalogsByTenant((prev) => {
      const existing = prev[tenant.slug] || defaultNormalizedCatalog;
      const existingOrders = existing.orderIds
        .map((id) => existing.ordersById[id])
        .filter((o): o is Order => Boolean(o));

      const mergedCategories =
        mode === 'merge'
          ? [
              ...existing.categoryIds
                .map((id) => existing.categoriesById[id])
                .filter((c): c is Category => Boolean(c)),
              ...newCategories,
            ]
          : newCategories;

      const mergedProducts =
        mode === 'merge'
          ? [
              ...existing.productIds
                .map((id) => existing.productsById[id])
                .filter((p): p is Product => Boolean(p)),
              ...newProducts,
            ]
          : newProducts;

      const normalizedImported = sanitizeTenantCatalog({
        categories: mergedCategories,
        products: mergedProducts,
        orders: existingOrders,
        updatedAt: Date.now(),
      });

      return {
        ...prev,
        [tenant.slug]: normalizedImported,
      };
    });

    // Sync imported catalog with backend server for Zero-Trust Checkout price validation
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authSession?.token) {
      headers['Authorization'] = `Bearer ${authSession.token}`;
    }
    fetch(`/api/v1/tenants/${tenant.slug}/catalog/import`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        mode,
        categories: newCategories,
        products: newProducts,
      }),
    }).catch(() => {});
  };

  // When consumer creates order in the menu (O(1) order insertion)
  const handleOrderCreated = (newOrder: Order) => {
    setSelectedTrackingOrder(newOrder);
    markTenantCatalogDirty(tenant.slug);
    setCatalogsByTenant((prev) => {
      const existing = prev[tenant.slug] || defaultNormalizedCatalog;
      const alreadyExists = Boolean(existing.ordersById[newOrder.id]);
      return {
        ...prev,
        [tenant.slug]: {
          ...existing,
          ordersById: {
            ...existing.ordersById,
            [newOrder.id]: newOrder,
          },
          orderIds: alreadyExists
            ? existing.orderIds
            : [newOrder.id, ...existing.orderIds],
          updatedAt: Date.now(),
        },
      };
    });

    // update or add customer
    const existingCustIndex = customers.findIndex((c) => c.phone === newOrder.customerPhone);
    if (existingCustIndex >= 0) {
      const updated = [...customers];
      updated[existingCustIndex] = {
        ...updated[existingCustIndex],
        ordersCount: updated[existingCustIndex].ordersCount + 1,
        totalSpentCents: updated[existingCustIndex].totalSpentCents + newOrder.totalCents,
        lastOrderAt: 'Hoje às ' + newOrder.createdAt,
      };
      setCustomers(updated);
    } else {
      setCustomers([
        {
          id: `cust_${Date.now()}`,
          name: newOrder.customerName,
          phone: newOrder.customerPhone,
          ordersCount: 1,
          totalSpentCents: newOrder.totalCents,
          firstOrderAt: new Date().toISOString().split('T')[0],
          lastOrderAt: 'Hoje às ' + newOrder.createdAt,
          marketingConsent: true,
        },
        ...customers,
      ]);
    }
  };

  // Update order status in KDS in O(1) time and trigger WhatsApp Evolution API Notification
  const handleUpdateOrderStatus = (orderId: string, nextStatus: OrderStatus) => {
    // Sync with backend API to record outbox event and fire Evolution API notification
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authSession?.token) {
      headers['Authorization'] = `Bearer ${authSession.token}`;
    }
    fetch(`/api/v1/orders/${orderId}/status`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status: nextStatus }),
    }).catch(() => {});

    markTenantCatalogDirty(tenant.slug);
    setCatalogsByTenant((prev) => {
      const existing = prev[tenant.slug] || defaultNormalizedCatalog;
      const targetOrder = existing.ordersById[orderId];
      if (!targetOrder) return prev;

      const timestamp = new Date().toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      });
      const newLog = {
        timestamp,
        event: `order.status_${nextStatus}`,
        detail: `Status atualizado para "${nextStatus}" no painel KDS. Notificação despachada via Evolution API (${tenant.evolutionInstanceId || 'aladay'}).`,
        statusSent: nextStatus,
      };
      const updatedOrder: Order = {
        ...targetOrder,
        status: nextStatus,
        updatedAt: timestamp,
        whatsAppLogs: [newLog, ...(targetOrder.whatsAppLogs || [])],
      };

      if (selectedTrackingOrder?.id === orderId) {
        setSelectedTrackingOrder(updatedOrder);
      }

      return {
        ...prev,
        [tenant.slug]: {
          ...existing,
          ordersById: {
            ...existing.ordersById,
            [orderId]: updatedOrder,
          },
          updatedAt: Date.now(),
        },
      };
    });
  };

  // Simulate Evolution API reconnect
  const handleSimulateEvolutionReconnect = () => {
    setTenant((prev) => ({ ...prev, evolutionStatus: 'connecting' }));
    setTimeout(() => {
      setTenant((prev) => ({ ...prev, evolutionStatus: 'connected' }));
    }, 1200);
  };

  // Download entire blueprint as markdown
  const handleDownloadFullDoc = () => {
    const fullMarkdown = BLUEPRINT_SECTIONS.map(
      (s) => `## ${s.number}. ${s.title}\n\n_${s.subtitle}_\n\n${s.contentMarkdown}\n\n---\n`
    ).join('\n');

    const blob = new Blob([fullMarkdown], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'Aladay_Cardapios_Digitais_Asaas_Cloudflare.md');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Universal Top Bar Contract (Brand Zone - Nav Zone - Primary Action) */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-2xs">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-8">
          {/* Zone 1: Brand Wordmark with Tech Blue emblem */}
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => {
                handleNavigateSafely('home');
                setIsMobileMenuOpen(false);
              }}
              className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-slate-950 hover:text-blue-600 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center text-xs font-black shadow-xs shadow-blue-600/25">
                A
              </span>
              <span>Aladay</span>
            </button>

            {authSession && hasActiveSubscription && isTrialActiveAndValid && (
              <span
                className="inline-flex sm:hidden items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold font-mono shrink-0"
                title={`Período de Teste Grátis de 15 dias ativo (${trialDaysLeft} dias restantes)`}
              >
                <span>🎁 {trialDaysLeft}d</span>
              </span>
            )}
          </div>

          {/* Zone 2: Desktop Navigation Links - Unsubscribed clients ONLY see Home & Public Sections */}
          <nav className="hidden md:flex items-center gap-5 text-xs font-semibold text-slate-600">
            {hasActiveSubscription ? (
              <>
                <button
                  type="button"
                  onClick={() => handleNavigateSafely('home')}
                  className={`hover:text-blue-600 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    currentView === 'home' ? 'text-blue-600 font-bold underline decoration-2 underline-offset-8' : ''
                  }`}
                >
                  Início
                </button>
                <button
                  type="button"
                  onClick={() => handleNavigateSafely('consumer')}
                  className={`hover:text-blue-600 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    currentView === 'consumer' ? 'text-blue-600 font-bold underline decoration-2 underline-offset-8' : ''
                  }`}
                >
                  Cardápio Digital
                </button>
                <button
                  type="button"
                  onClick={() => handleNavigateSafely('admin')}
                  className={`hover:text-blue-600 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    currentView === 'admin' ? 'text-blue-600 font-bold underline decoration-2 underline-offset-8' : ''
                  }`}
                >
                  Painel &amp; KDS (Loja)
                </button>
                <button
                  type="button"
                  onClick={() => handleNavigateSafely('whatsapp')}
                  className={`hover:text-blue-600 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    currentView === 'whatsapp' ? 'text-blue-600 font-bold underline decoration-2 underline-offset-8' : ''
                  }`}
                >
                  WhatsApp
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => handleNavigateSafely('home')}
                  className={`hover:text-blue-600 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    currentView === 'home' ? 'text-blue-600 font-bold underline decoration-2 underline-offset-8' : ''
                  }`}
                >
                  Início
                </button>
                <a
                  href="#demonstracao-celular"
                  onClick={() => {
                    if (currentView !== 'home') handleNavigateSafely('home');
                  }}
                  className="hover:text-blue-600 transition-colors whitespace-nowrap shrink-0"
                >
                  Demonstração no Celular
                </a>
                <a
                  href="#planos"
                  onClick={() => {
                    if (currentView !== 'home') handleNavigateSafely('home');
                  }}
                  className="hover:text-blue-600 transition-colors whitespace-nowrap shrink-0"
                >
                  Planos (a partir de R$ 99,00/mês)
                </a>
                <a
                  href="#calculadora"
                  onClick={() => {
                    if (currentView !== 'home') handleNavigateSafely('home');
                  }}
                  className="hover:text-blue-600 transition-colors whitespace-nowrap shrink-0"
                >
                  Calculadora de Economia
                </a>
              </>
            )}
          </nav>

          {/* Zone 3: Active Profile Badge & Login / Auth Portal + Mobile Hamburger Button */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {authSession && hasActiveSubscription ? (
              <>
                {authSession.user.role === 'SUPER_ADMIN' ? (
                  <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-800 border border-indigo-200 text-[11px] font-bold">
                    <span>👑 Super Admin</span>
                  </span>
                ) : authSession.user.role === 'TENANT_OWNER' ? (
                  <div className="hidden sm:flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-50 text-blue-800 border border-blue-200 text-[11px] font-bold">
                      <span>🏪 {tenant.name}</span>
                    </span>
                    {isTrialActiveAndValid && (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-sky-50 text-sky-800 border border-sky-200 text-[10px] font-bold font-mono"
                        title={`Período de Teste Grátis de 15 dias ativo (${trialDaysLeft} dias restantes)`}
                      >
                        <span>🎁 Teste Grátis: {trialDaysLeft}d</span>
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-50 text-blue-800 border border-blue-200 text-[11px] font-bold">
                    <span>🍳 Cozinha</span>
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => {
                    handleNavigateSafely('auth');
                    setIsMobileMenuOpen(false);
                  }}
                  className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  title="Gerenciar conta"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Conta</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleLogout();
                    setIsMobileMenuOpen(false);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer border border-rose-200"
                  title="Sair da sessão"
                >
                  <span>Sair</span>
                </button>
              </>
            ) : (
              <div className="flex items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={() => {
                    handleNavigateSafely('auth');
                    setIsMobileMenuOpen(false);
                  }}
                  className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5 text-slate-500" />
                  <span>Entrar</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleNavigateSafely('kickoff');
                    setIsMobileMenuOpen(false);
                  }}
                  className="flex items-center gap-1 px-2.5 sm:px-3.5 py-1.5 text-[11px] sm:text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-xs shadow-blue-600/20"
                >
                  <span>Teste Grátis 15d</span>
                </button>
              </div>
            )}

            {/* Mobile Hamburger Button */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen((prev) => !prev)}
              aria-label="Abrir ou fechar menu de navegação"
              aria-expanded={isMobileMenuOpen}
              className="md:hidden inline-flex items-center justify-center p-2 rounded-lg text-slate-700 hover:text-blue-600 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
            >
              {isMobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Always-Visible Mobile Top Navigation Strip (< md) */}
        <nav
          aria-label="Navegação rápida mobile"
          className="md:hidden border-t border-slate-200 bg-slate-50/90 px-3 py-2 flex items-center gap-1.5 overflow-x-auto"
        >
          {hasActiveSubscription ? (
            <>
              <button
                type="button"
                onClick={() => {
                  handleNavigateSafely('home');
                  setIsMobileMenuOpen(false);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  currentView === 'home'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                Início
              </button>
              <button
                type="button"
                onClick={() => {
                  handleNavigateSafely('consumer');
                  setIsMobileMenuOpen(false);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  currentView === 'consumer'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                Cardápio Digital
              </button>
              <button
                type="button"
                onClick={() => {
                  handleNavigateSafely('admin');
                  setIsMobileMenuOpen(false);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  currentView === 'admin'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                Painel &amp; KDS (Loja)
              </button>
              <button
                type="button"
                onClick={() => {
                  handleNavigateSafely('whatsapp');
                  setIsMobileMenuOpen(false);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  currentView === 'whatsapp'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                WhatsApp
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  handleNavigateSafely('home');
                  setIsMobileMenuOpen(false);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  currentView === 'home'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                Início
              </button>
              <a
                href="#demonstracao-celular"
                onClick={() => {
                  if (currentView !== 'home') handleNavigateSafely('home');
                  setIsMobileMenuOpen(false);
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 bg-white text-slate-700 border border-slate-200 hover:bg-slate-100 transition-colors"
              >
                Demonstração no Celular
              </a>
              <a
                href="#planos"
                onClick={() => {
                  if (currentView !== 'home') handleNavigateSafely('home');
                  setIsMobileMenuOpen(false);
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 bg-white text-slate-700 border border-slate-200 hover:bg-slate-100 transition-colors"
              >
                Planos (R$ 99/mês Anual)
              </a>
              <a
                href="#calculadora"
                onClick={() => {
                  if (currentView !== 'home') handleNavigateSafely('home');
                  setIsMobileMenuOpen(false);
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 bg-white text-slate-700 border border-slate-200 hover:bg-slate-100 transition-colors"
              >
                Calculadora
              </a>
            </>
          )}
        </nav>

        {/* Expandable Mobile Drawer Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200 bg-white px-4 py-4 space-y-3 shadow-lg">
            {authSession && hasActiveSubscription && (
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-50 text-blue-800 border border-blue-200 text-xs font-bold">
                    <span>🏪 {tenant.name}</span>
                  </span>
                  {isTrialActiveAndValid && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-sky-50 text-sky-800 border border-sky-200 text-[11px] font-bold font-mono">
                      <span>🎁 Teste Grátis: {trialDaysLeft}d</span>
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    handleNavigateSafely('auth');
                    setIsMobileMenuOpen(false);
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Minha Conta</span>
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 gap-1.5">
              {hasActiveSubscription ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      handleNavigateSafely('home');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-semibold transition-colors ${
                      currentView === 'home' ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Início
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleNavigateSafely('consumer');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-semibold transition-colors ${
                      currentView === 'consumer' ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Cardápio Digital (Visão do Cliente)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleNavigateSafely('admin');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-semibold transition-colors ${
                      currentView === 'admin' ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Painel &amp; KDS (Gestão da Loja)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleNavigateSafely('whatsapp');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-semibold transition-colors ${
                      currentView === 'whatsapp' ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Automação de WhatsApp
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      handleNavigateSafely('home');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-semibold transition-colors ${
                      currentView === 'home' ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Página Inicial
                  </button>
                  <a
                    href="#demonstracao-celular"
                    onClick={() => {
                      if (currentView !== 'home') handleNavigateSafely('home');
                      setIsMobileMenuOpen(false);
                    }}
                    className="block w-full text-left px-3 py-2.5 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                  >
                    Demonstração no Celular
                  </a>
                  <a
                    href="#planos"
                    onClick={() => {
                      if (currentView !== 'home') handleNavigateSafely('home');
                      setIsMobileMenuOpen(false);
                    }}
                    className="block w-full text-left px-3 py-2.5 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                  >
                    Planos &amp; Preço (R$ 99,00/mês Anual no Cartão ou R$ 129,90/mês)
                  </a>
                  <a
                    href="#calculadora"
                    onClick={() => {
                      if (currentView !== 'home') handleNavigateSafely('home');
                      setIsMobileMenuOpen(false);
                    }}
                    className="block w-full text-left px-3 py-2.5 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                  >
                    Calculadora de Economia
                  </a>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Main Content Viewport */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
        {currentView === 'home' && (
          <LandingPageView
            tenant={tenant}
            authSession={authSession}
            onNavigateToLogin={() => handleNavigateSafely('auth')}
            onNavigateToSetup={() => handleNavigateSafely('kickoff')}
            onNavigateToDemoMenu={() => handleNavigateSafely('consumer')}
            onNavigateToAdmin={() => handleNavigateSafely('admin')}
            onNavigateToTerms={() => {
              setCurrentView('terms');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onNavigateToPrivacy={() => {
              setCurrentView('privacy');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}

        {(currentView === 'terms' || currentView === 'privacy') && (
          <LegalComplianceView
            initialTab={currentView === 'privacy' ? 'privacy' : 'terms'}
            onTabChange={(tab) => setCurrentView(tab)}
            onBackToHome={() => {
              setCurrentView('home');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}

        {currentView === 'kickoff' && (
          <ProjectKickoffView
            onTenantCreated={handleTenantCreated}
            onNavigateToView={(view) => handleNavigateSafely(view)}
            onSessionAuthenticated={handleSessionAuthenticated}
          />
        )}

        {currentView === 'consumer' &&
          !isTrialExpiredWithoutAsaas &&
          (hasActiveSubscription || isAllowedPublicStoreView) && (
          <div className="py-2 space-y-4">
            {/* Share Digital Menu Banner at top of Digital Menu Page */}
            <div className="max-w-md mx-auto bg-white border border-slate-200 rounded-2xl p-3.5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center shrink-0">
                  <Share2 className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900">
                    Link do Cardápio Digital
                  </p>
                  <p className="text-[11px] font-mono text-slate-500 truncate">
                    {typeof window !== 'undefined'
                      ? `${window.location.origin}${window.location.pathname}?loja=${tenant.slug}`
                      : `https://${tenant.slug}.com.br`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const url =
                      typeof window !== 'undefined'
                        ? `${window.location.origin}${window.location.pathname}?loja=${encodeURIComponent(tenant.slug)}`
                        : `https://${tenant.slug}.com.br`;
                    navigator.clipboard?.writeText(url).catch(() => {});
                    setTopMenuLinkCopied(true);
                    setTimeout(() => setTopMenuLinkCopied(false), 3000);
                  }}
                  className={`flex-1 sm:flex-initial px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    topMenuLinkCopied
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-900 hover:bg-slate-800 text-white'
                  }`}
                >
                  {topMenuLinkCopied ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar Link</span>
                    </>
                  )}
                </button>

                <a
                  href={`https://wa.me/?text=${encodeURIComponent(
                    `🍔 Confira o cardápio digital de *${tenant.name}* e faça seu pedido online:\n${
                      typeof window !== 'undefined'
                        ? `${window.location.origin}${window.location.pathname}?loja=${encodeURIComponent(tenant.slug)}`
                        : `https://${tenant.slug}.com.br`
                    }`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 sm:flex-initial px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>WhatsApp</span>
                  <ExternalLink className="w-3 h-3 opacity-80" />
                </a>
              </div>
            </div>

            <ConsumerMenuView
              tenant={tenant}
              categories={categories}
              products={products}
              onOrderCreated={handleOrderCreated}
              onViewTracking={(order) => {
                setSelectedTrackingOrder(order);
                handleNavigateSafely('tracking');
              }}
            />
          </div>
        )}

        {currentView === 'tracking' &&
          !isTrialExpiredWithoutAsaas &&
          (hasActiveSubscription || isAllowedPublicStoreView) && (
          <OrderTrackingView
            order={selectedTrackingOrder || orders[0] || INITIAL_ORDERS[0]}
            tenant={tenant}
            onUpdateOrderStatus={handleUpdateOrderStatus}
            onBackToMenu={() => handleNavigateSafely('consumer')}
          />
        )}

        {currentView === 'auth' && (
          <AuthPortalView
            currentSession={authSession}
            onSessionAuthenticated={handleSessionAuthenticated}
            onLogout={handleLogout}
            onNavigateToAdmin={() => handleNavigateSafely('admin')}
          />
        )}

        {currentView === 'admin' && !isTrialExpiredWithoutAsaas && hasActiveSubscription && (
          <RestaurantAdminView
            tenant={tenant}
            orders={orders}
            products={products}
            categories={categories}
            customers={customers}
            allTenants={tenantsList}
            onSelectTenant={handleSelectTenant}
            onUpdateTenant={handleUpdateTenant}
            onUpdateOrderStatus={handleUpdateOrderStatus}
            onToggleProductAvailability={handleToggleProductAvailability}
            onAddProduct={handleAddProduct}
            onUpdateProduct={handleUpdateProduct}
            onDeleteProduct={handleDeleteProduct}
            onAddCategory={handleAddCategory}
            onImportCatalog={handleImportCatalog}
            onSimulateEvolutionReconnect={handleSimulateEvolutionReconnect}
            authSession={authSession}
            onOpenAuthPortal={() => handleNavigateSafely('auth')}
          />
        )}
        {currentView === 'whatsapp' && !isTrialExpiredWithoutAsaas && hasActiveSubscription && (
          <WhatsAppAutomationView
            tenant={tenant}
            orders={orders}
            initialSubTab="status_notifications"
            onUpdateTenant={handleUpdateTenant}
            onSimulateEvolutionReconnect={handleSimulateEvolutionReconnect}
            authSession={authSession}
          />
        )}

        {currentView === 'calculator' && !isTrialExpiredWithoutAsaas && hasActiveSubscription && (
          <FinancialCalculator />
        )}

        {currentView === 'diagrams' && !isTrialExpiredWithoutAsaas && hasActiveSubscription && (
          <TechDiagramsView />
        )}
      </div>

      {/* Modal de Bloqueio de Acesso (Teste de 15 Dias Expirado sem Assinatura Asaas ou Sem Assinatura Ativa) */}
      {showSubscriptionNoticeModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 space-y-5 shadow-2xl border border-slate-200 relative animate-in fade-in duration-150">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                    isTrialExpiredWithoutAsaas
                      ? 'bg-rose-50 border-rose-200 text-rose-700'
                      : 'bg-blue-50 border-blue-200 text-blue-600'
                  }`}
                >
                  {isTrialExpiredWithoutAsaas ? (
                    <ShieldAlert className="w-5 h-5" />
                  ) : (
                    <Lock className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-950">
                    {isTrialExpiredWithoutAsaas
                      ? 'Teste Grátis de 15 Dias Expirado'
                      : 'Acesso Exclusivo para Assinantes'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {isTrialExpiredWithoutAsaas
                      ? `${tenant.name} · Assinatura Asaas Pendente`
                      : 'Plano Anual R$ 99,00/mês (Cartão) ou Mensal R$ 129,90/mês'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSubscriptionNoticeModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isTrialExpiredWithoutAsaas ? (
              <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
                <p>
                  O período de <strong>15 dias de teste grátis</strong> do restaurante{' '}
                  <strong>{tenant.name}</strong> encerrou e ainda não identificamos uma{' '}
                  <strong>assinatura ativa no Asaas</strong>.
                </p>
                <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-rose-900 font-semibold">
                    <span className="w-2 h-2 rounded-full bg-rose-600" />
                    <span>Painel Admin e Cardápio Digital Bloqueados:</span>
                  </div>
                  <p className="text-[11px] text-rose-700 pl-3.5">
                    Para liberar imediatamente o Cardápio Digital da sua loja e o Painel de Gestão (KDS &amp; WhatsApp), ative a <strong>Assinatura Anual por R$ 99,00/mês no Cartão de Crédito</strong> ou a assinatura mensal de R$ 129,90 no Asaas.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
                <p>
                  O <strong>Cardápio Digital personalizado</strong> e o{' '}
                  <strong>Painel de Gestão da Loja (KDS &amp; WhatsApp)</strong> são liberados imediatamente ao iniciar seu{' '}
                  <strong>Período de Teste Grátis de 15 Dias</strong> ou assinar o plano Aladay Pro (<strong>R$ 99,00/mês no Plano Anual no Cartão</strong> ou R$ 129,90/mês no Mensal).
                </p>
                <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-200/80 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-slate-900 font-semibold">
                    <span className="w-2 h-2 rounded-full bg-blue-600" />
                    <span>Teste Grátis por 15 Dias:</span>
                  </div>
                  <p className="text-[11px] text-slate-600 pl-3.5">
                    Experimente todos os recursos da plataforma por 15 dias sem nenhuma cobrança hoje (R$ 0,00).
                  </p>
                </div>
              </div>
            )}

            <div className="pt-2 space-y-2">
              <button
                type="button"
                onClick={() => {
                  setShowSubscriptionNoticeModal(false);
                  setCurrentView('kickoff');
                }}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm shadow-blue-600/20"
              >
                <span>
                  {isTrialExpiredWithoutAsaas
                    ? 'Ativar Assinatura (A partir de R$ 99,00/mês no Cartão)'
                    : 'Começar Teste Grátis de 15 Dias (R$ 0,00)'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowSubscriptionNoticeModal(false);
                  setCurrentView('auth');
                }}
                className="w-full py-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-medium text-xs rounded-xl transition-colors cursor-pointer text-center"
              >
                Já tenho Cadastro &middot; Fazer Login
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clean quiet footer with WhatsApp support button, Terms of Use and Privacy Policy links */}
      <footer className="border-t border-slate-200 bg-white py-5 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
            <span className="font-bold text-slate-900">Aladay Cardápios Digitais</span>
            <a
              href={`https://wa.me/559131976334?text=${encodeURIComponent('Olá! Gostaria de tirar uma dúvida sobre o Aladay Cardápios Digitais.')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-2xs transition-colors cursor-pointer"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Tirar dúvidas no WhatsApp</span>
            </a>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => {
                setCurrentView('terms');
                if (typeof window !== 'undefined') {
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }
              }}
              className={`transition-colors cursor-pointer font-medium ${
                currentView === 'terms'
                  ? 'text-blue-600 font-bold underline underline-offset-4'
                  : 'text-slate-600 hover:text-blue-600 hover:underline underline-offset-4'
              }`}
            >
              Termos de Uso
            </button>
            <span aria-hidden="true" className="text-slate-300">
              ·
            </span>
            <button
              type="button"
              onClick={() => {
                setCurrentView('privacy');
                if (typeof window !== 'undefined') {
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }
              }}
              className={`transition-colors cursor-pointer font-medium ${
                currentView === 'privacy'
                  ? 'text-blue-600 font-bold underline underline-offset-4'
                  : 'text-slate-600 hover:text-blue-600 hover:underline underline-offset-4'
              }`}
            >
              Política de Privacidade (LGPD)
            </button>
            <span aria-hidden="true" className="hidden sm:inline text-slate-300">
              ·
            </span>
            <span className="hidden sm:inline text-slate-400">
              © {new Date().getFullYear()} Aladay
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
