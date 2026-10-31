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
import { AuthSession, Category, CustomerRecord, Order, OrderStatus, Product, RestaurantTenant } from './types';
import { BLUEPRINT_SECTIONS } from './data/blueprintSections';
import { LogIn, Lock, ShieldAlert, X, ArrowRight, Menu, Share2, Copy, Check, MessageSquare, ExternalLink } from 'lucide-react';
import { WhatsAppAutomationView } from './components/WhatsAppAutomationView';
import { AuthPortalView } from './components/AuthPortalView';
import { LandingPageView } from './components/LandingPageView';

export default function App() {
  const sharedLojaParam = React.useMemo(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('loja');
  }, []);

  const [currentView, setCurrentView] = useState<'home' | 'kickoff' | 'consumer' | 'admin' | 'calculator' | 'diagrams' | 'tracking' | 'whatsapp' | 'auth'>(() =>
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

  // Shared state between consumer cardápio and restaurant admin (persisted in localStorage)
  const [tenantsList, setTenantsList] = useState<RestaurantTenant[]>(() => {
    try {
      const saved = localStorage.getItem('aladay_prod_tenants_list_v2');
      return saved ? JSON.parse(saved) : INITIAL_TENANTS_LIST;
    } catch {
      return INITIAL_TENANTS_LIST;
    }
  });

  const [tenant, setTenant] = useState<RestaurantTenant>(() => {
    try {
      const savedList: RestaurantTenant[] = JSON.parse(
        localStorage.getItem('aladay_prod_tenants_list_v2') || 'null'
      ) || INITIAL_TENANTS_LIST;
      if (sharedLojaParam) {
        const matchedBySlug = savedList.find(
          (t) => t.slug.toLowerCase() === sharedLojaParam.toLowerCase()
        );
        if (matchedBySlug) return matchedBySlug;
      }
      const saved = localStorage.getItem('aladay_prod_tenant_v2');
      return saved ? JSON.parse(saved) : INITIAL_TENANT;
    } catch {
      return INITIAL_TENANT;
    }
  });

  // Helper to automatically repair any numeric-only category names (e.g. "1", "2", "3", "4")
  // that may have been saved in localStorage from a previous spreadsheet upload and normalize order sequentially
  const sanitizeCatalogData = (
    rawCatalog: Record<string, { categories: Category[]; products: Product[]; orders: Order[] }>
  ) => {
    const defaultOrderNames: Record<string, string> = {
      '1': 'Lanches & Burgers',
      '2': 'Porções & Entradas',
      '3': 'Bebidas',
      '4': 'Sobremesas',
    };
    const normalizeStr = (s: string) =>
      s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();

    const cleaned: Record<string, { categories: Category[]; products: Product[]; orders: Order[] }> = {};

    Object.entries(rawCatalog).forEach(([slug, data]) => {
      if (!data || !Array.isArray(data.categories) || !Array.isArray(data.products)) {
        cleaned[slug] = data;
        return;
      }

      const catMapByNorm = new Map<string, Category>();
      const idRemap = new Map<string, string>();

      // First pass: register valid non-numeric categories
      data.categories.forEach((cat) => {
        const trimmed = cat.name.trim();
        if (!/^\d+$/.test(trimmed)) {
          const norm = normalizeStr(trimmed);
          if (!catMapByNorm.has(norm)) {
            catMapByNorm.set(norm, { ...cat, name: trimmed });
          } else {
            idRemap.set(cat.id, catMapByNorm.get(norm)!.id);
          }
        }
      });

      // Second pass: repair numeric-only categories ("1", "2", "3", "4")
      data.categories.forEach((cat) => {
        const trimmed = cat.name.trim();
        if (/^\d+$/.test(trimmed)) {
          const numOrder = parseInt(trimmed, 10) || cat.order || 1;
          const mappedName = defaultOrderNames[trimmed] || `Categoria ${trimmed}`;
          const norm = normalizeStr(mappedName);
          if (catMapByNorm.has(norm)) {
            const target = catMapByNorm.get(norm)!;
            idRemap.set(cat.id, target.id);
          } else {
            const repairedCat: Category = {
              ...cat,
              name: mappedName,
              order: numOrder,
            };
            catMapByNorm.set(norm, repairedCat);
          }
        }
      });

      const remappedProducts = data.products.map((p) => ({
        ...p,
        categoryId: idRemap.get(p.categoryId) || p.categoryId,
      }));

      // Remove empty default placeholder categories if repaired/imported categories exist with products
      const allUniqueCats = Array.from(catMapByNorm.values());
      const nonEmptyOrOnlyCats =
        allUniqueCats.length > 2
          ? allUniqueCats.filter(
              (c) =>
                remappedProducts.some((p) => p.categoryId === c.id) ||
                (normalizeStr(c.name) !== 'pratos principais' && normalizeStr(c.name) !== 'geral')
            )
          : allUniqueCats;

      const sortedCats = (nonEmptyOrOnlyCats.length > 0 ? nonEmptyOrOnlyCats : allUniqueCats)
        .sort((a, b) => a.order - b.order)
        .map((c, idx) => ({ ...c, order: idx + 1 }));

      cleaned[slug] = {
        ...data,
        categories: sortedCats,
        products: remappedProducts,
      };
    });

    return cleaned;
  };

  // Catalogs indexed by tenant slug (Multi-tenancy isolated state)
  const [catalogsByTenant, setCatalogsByTenant] = useState<
    Record<string, { categories: Category[]; products: Product[]; orders: Order[] }>
  >(() => {
    try {
      const saved = localStorage.getItem('aladay_prod_catalogs_v2');
      if (saved) return sanitizeCatalogData(JSON.parse(saved));
    } catch {
      // ignore
    }
    return {
      [INITIAL_TENANT.slug]: {
        categories: INITIAL_CATEGORIES,
        products: INITIAL_PRODUCTS,
        orders: INITIAL_ORDERS,
      },
    };
  });

  const [customers, setCustomers] = useState<CustomerRecord[]>(() => {
    try {
      const saved = localStorage.getItem('aladay_prod_customers_v2');
      return saved ? JSON.parse(saved) : INITIAL_CUSTOMERS;
    } catch {
      return INITIAL_CUSTOMERS;
    }
  });

  React.useEffect(() => {
    try {
      localStorage.setItem('aladay_prod_tenant_v2', JSON.stringify(tenant));
      localStorage.setItem('aladay_prod_tenants_list_v2', JSON.stringify(tenantsList));
      localStorage.setItem('aladay_prod_catalogs_v2', JSON.stringify(catalogsByTenant));
      localStorage.setItem('aladay_prod_customers_v2', JSON.stringify(customers));
    } catch {
      // ignore storage quota errors
    }
  }, [tenant, tenantsList, catalogsByTenant, customers]);

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

  // Active subscription validation logic:
  // - Super Admin has platform-wide access
  // - Tenant owner / kitchen staff has access ONLY IF authenticated AND their tenant has an active subscription
  //   (either tenant.asaasSubscription?.status === 'ACTIVE' or tenant.subscriptionStatus === 'active')
  // - Unsubscribed visitors / clients can ONLY access the home page ('home')
  //   (with 'kickoff' allowed for subscription checkout, and 'auth' for logging in)
  const isSuperAdmin = authSession?.user?.role === 'SUPER_ADMIN';
  const isTenantStaffOrOwner =
    authSession?.user?.role === 'TENANT_OWNER' ||
    authSession?.user?.role === 'KITCHEN_STAFF';

  const trialEndsIso = tenant?.asaasSubscription?.trialEndsAt || tenant?.trialEndsAt;
  const isTenantOnTrial = Boolean(
    tenant?.asaasSubscription?.status === 'TRIAL' ||
    tenant?.asaasSubscription?.isTrial ||
    tenant?.subscriptionStatus === 'trial'
  );
  const trialDaysLeft = isTenantOnTrial
    ? trialEndsIso
      ? Math.max(0, Math.ceil((new Date(trialEndsIso).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      : 15
    : 0;
  const isTrialActiveAndValid = isTenantOnTrial && trialDaysLeft > 0;

  const isTenantSubscribed = Boolean(
    tenant?.asaasSubscription?.status === 'ACTIVE' ||
    tenant?.subscriptionStatus === 'active' ||
    isTrialActiveAndValid
  );

  const hasActiveSubscription = Boolean(
    isSuperAdmin || (Boolean(authSession) && isTenantStaffOrOwner && isTenantSubscribed)
  );

  // Enforce access boundary: unsubscribed clients CAN ONLY access 'home', 'kickoff' (to buy), or 'auth' (to login),
  // OR 'consumer' / 'tracking' when accessing a restaurant's shared menu link (?loja=...)
  React.useEffect(() => {
    const isAllowedPublicStoreView =
      Boolean(sharedLojaParam) && (currentView === 'consumer' || currentView === 'tracking');
    if (
      !hasActiveSubscription &&
      !isAllowedPublicStoreView &&
      currentView !== 'home' &&
      currentView !== 'kickoff' &&
      currentView !== 'auth'
    ) {
      setCurrentView('home');
      setShowSubscriptionNoticeModal(true);
    }
  }, [hasActiveSubscription, currentView, sharedLojaParam]);

  const handleNavigateSafely = (targetView: typeof currentView) => {
    if (!hasActiveSubscription && targetView !== 'home' && targetView !== 'kickoff' && targetView !== 'auth') {
      setCurrentView('home');
      setShowSubscriptionNoticeModal(true);
      return;
    }
    setCurrentView(targetView);
  };

  // Derived current tenant data
  const currentCatalog = catalogsByTenant[tenant.slug] || {
    categories: INITIAL_CATEGORIES,
    products: INITIAL_PRODUCTS,
    orders: [],
  };
  const categories = currentCatalog.categories;
  const products = currentCatalog.products;
  const orders = currentCatalog.orders;

  // Tenant Handlers
  const handleTenantCreated = (newTenant: RestaurantTenant) => {
    setTenantsList((prev) => [...prev, newTenant]);
    setCatalogsByTenant((prev) => ({
      ...prev,
      [newTenant.slug]: {
        categories: [
          { id: `cat_${Date.now()}_1`, name: 'Pratos Principais', order: 1 },
          { id: `cat_${Date.now()}_2`, name: 'Bebidas', order: 2 },
        ],
        products: [],
        orders: [],
      },
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
        setTenant(matched);
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

  // Product & Category Handlers (Scoped to current tenant)
  const handleAddProduct = (newProduct: Product) => {
    setCatalogsByTenant((prev) => {
      const existing = prev[tenant.slug] || { categories: [], products: [], orders: [] };
      return {
        ...prev,
        [tenant.slug]: {
          ...existing,
          products: [newProduct, ...existing.products],
        },
      };
    });
  };

  const handleUpdateProduct = (updatedProduct: Product) => {
    setCatalogsByTenant((prev) => {
      const existing = prev[tenant.slug] || { categories: [], products: [], orders: [] };
      return {
        ...prev,
        [tenant.slug]: {
          ...existing,
          products: existing.products.map((p) => (p.id === updatedProduct.id ? updatedProduct : p)),
        },
      };
    });
  };

  const handleDeleteProduct = (productId: string) => {
    setCatalogsByTenant((prev) => {
      const existing = prev[tenant.slug] || { categories: [], products: [], orders: [] };
      return {
        ...prev,
        [tenant.slug]: {
          ...existing,
          products: existing.products.filter((p) => p.id !== productId),
        },
      };
    });
  };

  const handleToggleProductAvailability = (productId: string) => {
    setCatalogsByTenant((prev) => {
      const existing = prev[tenant.slug] || { categories: [], products: [], orders: [] };
      return {
        ...prev,
        [tenant.slug]: {
          ...existing,
          products: existing.products.map((p) =>
            p.id === productId ? { ...p, isAvailable: !p.isAvailable } : p
          ),
        },
      };
    });
  };

  const handleAddCategory = (categoryName: string) => {
    const newCat: Category = {
      id: `cat_${Date.now()}`,
      name: categoryName,
      order: categories.length + 1,
    };
    setCatalogsByTenant((prev) => {
      const existing = prev[tenant.slug] || { categories: [], products: [], orders: [] };
      return {
        ...prev,
        [tenant.slug]: {
          ...existing,
          categories: [...existing.categories, newCat],
        },
      };
    });
  };

  const handleImportCatalog = (
    newCategories: Category[],
    newProducts: Product[],
    mode: 'merge' | 'replace'
  ) => {
    setCatalogsByTenant((prev) => {
      const existing = prev[tenant.slug] || { categories: [], products: [], orders: [] };
      return {
        ...prev,
        [tenant.slug]: {
          ...existing,
          categories: newCategories,
          products: newProducts,
        },
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

  // When consumer creates order in the menu
  const handleOrderCreated = (newOrder: Order) => {
    setSelectedTrackingOrder(newOrder);
    setCatalogsByTenant((prev) => {
      const existing = prev[tenant.slug] || { categories: [], products: [], orders: [] };
      return {
        ...prev,
        [tenant.slug]: {
          ...existing,
          orders: [newOrder, ...existing.orders],
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

  // Update order status in KDS and trigger WhatsApp Evolution API Notification
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

    setCatalogsByTenant((prev) => {
      const existing = prev[tenant.slug] || { categories: [], products: [], orders: [] };
      return {
        ...prev,
        [tenant.slug]: {
          ...existing,
          orders: existing.orders.map((o) => {
            if (o.id === orderId) {
              const timestamp = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
              const newLog = {
                timestamp,
                event: `order.status_${nextStatus}`,
                detail: `Status atualizado para "${nextStatus}" no painel KDS. Notificação despachada via Evolution API (${tenant.evolutionInstanceId || 'aladay'}).`,
                statusSent: nextStatus,
              };
              const updatedOrder = {
                ...o,
                status: nextStatus,
                updatedAt: timestamp,
                whatsAppLogs: [newLog, ...(o.whatsAppLogs || [])],
              };
              if (selectedTrackingOrder?.id === orderId) {
                setSelectedTrackingOrder(updatedOrder);
              }
              return updatedOrder;
            }
            return o;
          }),
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
    <div className="min-h-screen bg-neutral-100 text-neutral-900 flex flex-col font-sans selection:bg-neutral-900 selection:text-white">
      {/* Universal Top Bar Contract (Brand Zone - Nav Zone - Primary Action) */}
      <header className="sticky top-0 z-50 bg-white border-b border-neutral-200 shadow-2xs">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-8">
          {/* Zone 1: Single Text Element Brand Wordmark */}
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => {
                handleNavigateSafely('home');
                setIsMobileMenuOpen(false);
              }}
              className="text-lg font-black tracking-tight text-neutral-950 hover:text-emerald-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Aladay
            </button>

            {authSession && hasActiveSubscription && isTrialActiveAndValid && (
              <span
                className="inline-flex sm:hidden items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold font-mono shrink-0"
                title={`Período de Teste Grátis de 15 dias ativo (${trialDaysLeft} dias restantes)`}
              >
                <span>🎁 {trialDaysLeft}d</span>
              </span>
            )}
          </div>

          {/* Zone 2: Desktop Navigation Links - Unsubscribed clients ONLY see Home & Public Sections */}
          <nav className="hidden md:flex items-center gap-5 text-xs font-medium text-neutral-600">
            {hasActiveSubscription ? (
              <>
                <button
                  type="button"
                  onClick={() => handleNavigateSafely('home')}
                  className={`hover:text-neutral-950 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    currentView === 'home' ? 'text-neutral-950 font-semibold underline underline-offset-8' : ''
                  }`}
                >
                  Início
                </button>
                <button
                  type="button"
                  onClick={() => handleNavigateSafely('consumer')}
                  className={`hover:text-neutral-950 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    currentView === 'consumer' ? 'text-neutral-950 font-semibold underline underline-offset-8' : ''
                  }`}
                >
                  Cardápio Digital
                </button>
                <button
                  type="button"
                  onClick={() => handleNavigateSafely('admin')}
                  className={`hover:text-neutral-950 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    currentView === 'admin' ? 'text-neutral-950 font-semibold underline underline-offset-8' : ''
                  }`}
                >
                  Painel &amp; KDS (Loja)
                </button>
                <button
                  type="button"
                  onClick={() => handleNavigateSafely('whatsapp')}
                  className={`hover:text-neutral-950 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    currentView === 'whatsapp' ? 'text-neutral-950 font-semibold underline underline-offset-8' : ''
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
                  className={`hover:text-neutral-950 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    currentView === 'home' ? 'text-neutral-950 font-semibold underline underline-offset-8' : ''
                  }`}
                >
                  Início
                </button>
                <a
                  href="#demonstracao-celular"
                  onClick={() => {
                    if (currentView !== 'home') handleNavigateSafely('home');
                  }}
                  className="hover:text-neutral-950 transition-colors whitespace-nowrap shrink-0"
                >
                  Demonstração no Celular
                </a>
                <a
                  href="#planos"
                  onClick={() => {
                    if (currentView !== 'home') handleNavigateSafely('home');
                  }}
                  className="hover:text-neutral-950 transition-colors whitespace-nowrap shrink-0"
                >
                  Planos &amp; Preço (R$ 129,90)
                </a>
                <a
                  href="#calculadora"
                  onClick={() => {
                    if (currentView !== 'home') handleNavigateSafely('home');
                  }}
                  className="hover:text-neutral-950 transition-colors whitespace-nowrap shrink-0"
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
                  <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-purple-50 text-purple-800 border border-purple-200 text-[11px] font-bold">
                    <span>👑 Super Admin</span>
                  </span>
                ) : authSession.user.role === 'TENANT_OWNER' ? (
                  <div className="hidden sm:flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-bold">
                      <span>🏪 {tenant.name}</span>
                    </span>
                    {isTrialActiveAndValid && (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold font-mono"
                        title={`Período de Teste Grátis de 15 dias ativo (${trialDaysLeft} dias restantes)`}
                      >
                        <span>🎁 Teste Grátis: {trialDaysLeft}d</span>
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-bold">
                    <span>🍳 Cozinha</span>
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => {
                    handleNavigateSafely('auth');
                    setIsMobileMenuOpen(false);
                  }}
                  className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
                  className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-neutral-700 hover:text-neutral-950 hover:bg-neutral-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5 text-neutral-500" />
                  <span>Entrar</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleNavigateSafely('kickoff');
                    setIsMobileMenuOpen(false);
                  }}
                  className="flex items-center gap-1 px-2.5 sm:px-3.5 py-1.5 text-[11px] sm:text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-2xs"
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
              className="md:hidden inline-flex items-center justify-center p-2 rounded-lg text-neutral-700 hover:text-neutral-950 hover:bg-neutral-100 border border-neutral-200 transition-colors cursor-pointer"
            >
              {isMobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Always-Visible Mobile Top Navigation Strip (< md) */}
        <nav
          aria-label="Navegação rápida mobile"
          className="md:hidden border-t border-neutral-200 bg-neutral-50 px-3 py-2 flex items-center gap-1.5 overflow-x-auto"
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
                    ? 'bg-neutral-900 text-white shadow-2xs'
                    : 'bg-white text-neutral-700 border border-neutral-200 hover:bg-neutral-100'
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
                    ? 'bg-neutral-900 text-white shadow-2xs'
                    : 'bg-white text-neutral-700 border border-neutral-200 hover:bg-neutral-100'
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
                    ? 'bg-neutral-900 text-white shadow-2xs'
                    : 'bg-white text-neutral-700 border border-neutral-200 hover:bg-neutral-100'
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
                    ? 'bg-neutral-900 text-white shadow-2xs'
                    : 'bg-white text-neutral-700 border border-neutral-200 hover:bg-neutral-100'
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
                    ? 'bg-neutral-900 text-white shadow-2xs'
                    : 'bg-white text-neutral-700 border border-neutral-200 hover:bg-neutral-100'
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
                className="px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 bg-white text-neutral-700 border border-neutral-200 hover:bg-neutral-100 transition-colors"
              >
                Demonstração no Celular
              </a>
              <a
                href="#planos"
                onClick={() => {
                  if (currentView !== 'home') handleNavigateSafely('home');
                  setIsMobileMenuOpen(false);
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 bg-white text-neutral-700 border border-neutral-200 hover:bg-neutral-100 transition-colors"
              >
                Planos (R$ 129,90)
              </a>
              <a
                href="#calculadora"
                onClick={() => {
                  if (currentView !== 'home') handleNavigateSafely('home');
                  setIsMobileMenuOpen(false);
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 bg-white text-neutral-700 border border-neutral-200 hover:bg-neutral-100 transition-colors"
              >
                Calculadora
              </a>
            </>
          )}
        </nav>

        {/* Expandable Mobile Drawer Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t border-neutral-200 bg-white px-4 py-4 space-y-3 shadow-lg">
            {authSession && hasActiveSubscription && (
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-neutral-100">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold">
                    <span>🏪 {tenant.name}</span>
                  </span>
                  {isTrialActiveAndValid && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-bold font-mono">
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
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg"
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
                      currentView === 'home' ? 'bg-neutral-900 text-white' : 'text-neutral-700 hover:bg-neutral-100'
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
                      currentView === 'consumer' ? 'bg-neutral-900 text-white' : 'text-neutral-700 hover:bg-neutral-100'
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
                      currentView === 'admin' ? 'bg-neutral-900 text-white' : 'text-neutral-700 hover:bg-neutral-100'
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
                      currentView === 'whatsapp' ? 'bg-neutral-900 text-white' : 'text-neutral-700 hover:bg-neutral-100'
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
                      currentView === 'home' ? 'bg-neutral-900 text-white' : 'text-neutral-700 hover:bg-neutral-100'
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
                    className="block w-full text-left px-3 py-2.5 rounded-lg text-xs font-semibold text-neutral-700 hover:bg-neutral-100 transition-colors"
                  >
                    Demonstração no Celular
                  </a>
                  <a
                    href="#planos"
                    onClick={() => {
                      if (currentView !== 'home') handleNavigateSafely('home');
                      setIsMobileMenuOpen(false);
                    }}
                    className="block w-full text-left px-3 py-2.5 rounded-lg text-xs font-semibold text-neutral-700 hover:bg-neutral-100 transition-colors"
                  >
                    Planos &amp; Preço (R$ 129,90/mês)
                  </a>
                  <a
                    href="#calculadora"
                    onClick={() => {
                      if (currentView !== 'home') handleNavigateSafely('home');
                      setIsMobileMenuOpen(false);
                    }}
                    className="block w-full text-left px-3 py-2.5 rounded-lg text-xs font-semibold text-neutral-700 hover:bg-neutral-100 transition-colors"
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
          />
        )}

        {currentView === 'kickoff' && (
          <ProjectKickoffView
            onTenantCreated={handleTenantCreated}
            onNavigateToView={(view) => setCurrentView(view)}
            onSessionAuthenticated={handleSessionAuthenticated}
          />
        )}

        {currentView === 'consumer' && (
          <div className="py-2 space-y-4">
            {/* Share Digital Menu Banner at top of Digital Menu Page */}
            <div className="max-w-md mx-auto bg-white border border-neutral-200 rounded-2xl p-3.5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
                  <Share2 className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-neutral-900">
                    Link do Cardápio Digital
                  </p>
                  <p className="text-[11px] font-mono text-neutral-500 truncate">
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
                      ? 'bg-emerald-600 text-white'
                      : 'bg-neutral-900 hover:bg-neutral-800 text-white'
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
                  className="flex-1 sm:flex-initial px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
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
                setCurrentView('tracking');
              }}
            />
          </div>
        )}

        {currentView === 'tracking' && (
          <OrderTrackingView
            order={selectedTrackingOrder || orders[0] || INITIAL_ORDERS[0]}
            tenant={tenant}
            onUpdateOrderStatus={handleUpdateOrderStatus}
            onBackToMenu={() => setCurrentView('consumer')}
          />
        )}

        {currentView === 'auth' && (
          <AuthPortalView
            currentSession={authSession}
            onSessionAuthenticated={handleSessionAuthenticated}
            onLogout={handleLogout}
            onNavigateToAdmin={() => setCurrentView('admin')}
          />
        )}

        {currentView === 'admin' && (
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
            onOpenAuthPortal={() => setCurrentView('auth')}
          />
        )}
        {currentView === 'whatsapp' && (
          <WhatsAppAutomationView
            tenant={tenant}
            orders={orders}
            initialSubTab="status_notifications"
            onUpdateTenant={handleUpdateTenant}
            onSimulateEvolutionReconnect={handleSimulateEvolutionReconnect}
            authSession={authSession}
          />
        )}

        {currentView === 'calculator' && <FinancialCalculator />}

        {currentView === 'diagrams' && <TechDiagramsView />}
      </div>

      {/* Modal de Proteção / Aviso de Assinatura para Clientes Não-Assinantes */}
      {showSubscriptionNoticeModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 space-y-5 shadow-2xl border border-neutral-200 relative animate-in fade-in duration-150">
            <div className="flex items-start justify-between border-b border-neutral-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 shrink-0">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-neutral-950">
                    Acesso Exclusivo para Assinantes
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Plano Aladay Pro &middot; R$ 129,90/mês
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSubscriptionNoticeModal(false)}
                className="text-neutral-400 hover:text-neutral-700 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-neutral-600 leading-relaxed">
              <p>
                O <strong>Cardápio Digital personalizado</strong> e o <strong>Painel de Gestão da Loja (KDS &amp; WhatsApp)</strong> são liberados imediatamente ao iniciar seu <strong>Período de Teste Grátis de 15 Dias</strong> ou assinar o plano Aladay Pro.
              </p>
              <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 space-y-1.5">
                <div className="flex items-center gap-1.5 text-neutral-900 font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>Teste Grátis por 15 Dias:</span>
                </div>
                <p className="text-[11px] text-neutral-500 pl-3.5">
                  Experimente todos os recursos da plataforma por 15 dias sem nenhuma cobrança hoje (R$ 0,00).
                </p>
              </div>
            </div>

            <div className="pt-2 space-y-2">
              <button
                type="button"
                onClick={() => {
                  setShowSubscriptionNoticeModal(false);
                  setCurrentView('kickoff');
                }}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              >
                <span>Começar Teste Grátis de 15 Dias (R$ 0,00)</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowSubscriptionNoticeModal(false);
                  setCurrentView('auth');
                }}
                className="w-full py-2.5 bg-white hover:bg-neutral-100 text-neutral-700 border border-neutral-300 font-medium text-xs rounded-xl transition-colors cursor-pointer text-center"
              >
                Já tenho Cadastro &middot; Fazer Login
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clean quiet footer */}
      <footer className="border-t border-neutral-200 bg-white py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-neutral-500">
          <div className="flex items-center gap-2">
            <span>Aladay cardápios digitais &amp; WhatsApp Evolution API</span>
            <span aria-hidden="true">·</span>
            <span>Mensalidade R$ 129,90</span>
            <span aria-hidden="true">·</span>
            <span>PostgreSQL RLS &amp; Outbox</span>
          </div>
          <span>Arquitetura de Alta Disponibilidade para Restaurantes</span>
        </div>
      </footer>
    </div>
  );
}
