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
import { LogIn } from 'lucide-react';
import { WhatsAppAutomationView } from './components/WhatsAppAutomationView';
import { AuthPortalView } from './components/AuthPortalView';
import { LandingPageView } from './components/LandingPageView';

export default function App() {
  const [currentView, setCurrentView] = useState<'home' | 'kickoff' | 'consumer' | 'admin' | 'calculator' | 'diagrams' | 'tracking' | 'whatsapp' | 'auth'>('home');
  const [selectedTrackingOrder, setSelectedTrackingOrder] = useState<Order | null>(null);

  const [authSession, setAuthSession] = useState<AuthSession>({
    token:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImFsYWRheS1jbG91ZGZsYXJlLTIwMjYifQ.eyJzdWIiOiJ1c3Jfc3VwZXJfMDEiLCJuYW1lIjoiQWRyaWFubyBTYXJhaXZhIChDRU8gQWxhZGF5KSIsImVtYWlsIjoiYWRtaW5AYWxhZGF5LmNvbS5iciIsInJvbGUiOiJTVVBFUl9BRE1JTiIsInRlbmFudF9pZCI6IioiLCJ0ZW5hbnRfc2x1ZyI6IioiLCJpc3MiOiJodHRwczovL2FsYWRheS5jb20uYnIifQ.aladay_hmac_sha256_sig',
    user: {
      id: 'usr_super_01',
      name: 'Adriano Saraiva (CEO Aladay)',
      email: 'admin@aladay.com.br',
      phone: '559181214188',
      role: 'SUPER_ADMIN',
      tenantId: '*',
      tenantSlug: '*',
      tenantName: 'Aladay Plataforma Global (Todos os Tenants)',
      permissions: [
        'platform:manage_tenants',
        'platform:asaas_subscriptions',
        'platform:evolution_instances',
        'tenant:full_access',
        'kds:manage_orders',
      ],
    },
    claims: {
      sub: 'usr_super_01',
      name: 'Adriano Saraiva (CEO Aladay)',
      email: 'admin@aladay.com.br',
      role: 'SUPER_ADMIN',
      tenant_id: '*',
      tenant_slug: '*',
      permissions: [
        'platform:manage_tenants',
        'platform:asaas_subscriptions',
        'platform:evolution_instances',
        'tenant:full_access',
        'kds:manage_orders',
      ],
      iss: 'https://aladay.com.br',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 43200,
    },
    authMethod: 'password',
    authenticatedAt: 'Agora',
  });
  
  // Shared state between consumer cardápio and restaurant admin
  const [tenantsList, setTenantsList] = useState<RestaurantTenant[]>(INITIAL_TENANTS_LIST);
  const [tenant, setTenant] = useState<RestaurantTenant>(INITIAL_TENANT);
  
  // Catalogs indexed by tenant slug (Multi-tenancy isolated state)
  const [catalogsByTenant, setCatalogsByTenant] = useState<
    Record<string, { categories: Category[]; products: Product[]; orders: Order[] }>
  >({
    'brasas-burger': {
      categories: INITIAL_CATEGORIES,
      products: INITIAL_PRODUCTS,
      orders: INITIAL_ORDERS,
    },
    'pizzaria-difiori': {
      categories: PIZZARIA_CATEGORIES,
      products: PIZZARIA_PRODUCTS,
      orders: [],
    },
  });

  const [customers, setCustomers] = useState<CustomerRecord[]>(INITIAL_CUSTOMERS);

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
        products: [
          {
            id: `prod_${Date.now()}_1`,
            categoryId: `cat_${Date.now()}_1`,
            name: `${newTenant.name} Especial`,
            description: 'Item exclusivo da casa preparado com ingredientes frescos selecionados.',
            priceCents: 4200,
            isAvailable: true,
          },
        ],
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
    if (newSession.user.tenantSlug !== '*') {
      const matched = tenantsList.find((t) => t.slug === newSession.user.tenantSlug);
      if (matched) {
        setTenant(matched);
      }
    }
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
    fetch(`/api/v1/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
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
      <header className="sticky top-0 z-50 bg-white border-b border-neutral-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single Text Element Brand Wordmark */}
          <button
            type="button"
            onClick={() => setCurrentView('home')}
            className="text-lg font-black tracking-tight text-neutral-950 hover:text-emerald-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Aladay
          </button>

          {/* Zone 2: 5 Concise Single-Line Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-neutral-600">
            <button
              type="button"
              onClick={() => setCurrentView('home')}
              className={`hover:text-neutral-950 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                currentView === 'home' ? 'text-neutral-950 font-semibold underline underline-offset-8' : ''
              }`}
            >
              Início
            </button>
            <button
              type="button"
              onClick={() => setCurrentView('consumer')}
              className={`hover:text-neutral-950 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                currentView === 'consumer' ? 'text-neutral-950 font-semibold underline underline-offset-8' : ''
              }`}
            >
              Cardápio Demo
            </button>
            <button
              type="button"
              onClick={() => setCurrentView('admin')}
              className={`hover:text-neutral-950 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                currentView === 'admin' ? 'text-neutral-950 font-semibold underline underline-offset-8' : ''
              }`}
            >
              Painel &amp; KDS
            </button>
            <button
              type="button"
              onClick={() => setCurrentView('whatsapp')}
              className={`hover:text-neutral-950 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                currentView === 'whatsapp' ? 'text-neutral-950 font-semibold underline underline-offset-8' : ''
              }`}
            >
              WhatsApp Real
            </button>
          </nav>

          {/* Zone 3: 1 Primary Action (Login Button) */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setCurrentView('auth')}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Fazer Login</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Viewport */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
        {currentView === 'home' && (
          <LandingPageView
            tenant={tenant}
            authSession={authSession}
            onNavigateToLogin={() => setCurrentView('auth')}
            onNavigateToSetup={() => setCurrentView('kickoff')}
            onNavigateToDemoMenu={() => setCurrentView('consumer')}
            onNavigateToAdmin={() => setCurrentView('admin')}
          />
        )}

        {currentView === 'kickoff' && (
          <ProjectKickoffView
            onTenantCreated={handleTenantCreated}
            onNavigateToView={(view) => setCurrentView(view)}
          />
        )}

        {currentView === 'consumer' && (
          <div className="py-2">
            <div className="mb-4 text-center max-w-xl mx-auto">
              <span className="text-xs text-neutral-500 font-mono">Visualização em Tempo Real do Consumidor</span>
              <h2 className="text-lg font-bold text-neutral-900">
                Cardápio Digital de {tenant.name}
              </h2>
              <p className="text-xs text-neutral-600 mt-0.5">
                Qualquer produto adicionado ou editado na Área de Membros aparece aqui instantaneamente.
              </p>
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
          />
        )}

        {currentView === 'calculator' && <FinancialCalculator />}

        {currentView === 'diagrams' && <TechDiagramsView />}
      </div>

      {/* Clean quiet footer */}
      <footer className="border-t border-neutral-200 bg-white py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-neutral-500">
          <div className="flex items-center gap-2">
            <span>SaaS de Cardápios Digitais &amp; WhatsApp Evolution API</span>
            <span aria-hidden="true">·</span>
            <span>Mensalidade R$ 99,00</span>
            <span aria-hidden="true">·</span>
            <span>PostgreSQL RLS &amp; Outbox</span>
          </div>
          <span>Arquitetura de Alta Disponibilidade para Restaurantes</span>
        </div>
      </footer>
    </div>
  );
}
