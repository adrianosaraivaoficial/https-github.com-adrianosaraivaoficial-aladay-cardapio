import React, { useState, useMemo, useEffect } from 'react';
import {
  LayoutGrid,
  Utensils,
  MessageSquare,
  Users,
  BarChart3,
  QrCode,
  RefreshCw,
  CheckCircle2,
  Phone,
  Check,
  X,
  ArrowRight,
  Plus,
  Edit2,
  Trash2,
  Settings,
  HelpCircle,
  Clock,
  Sparkles,
  DollarSign,
  AlertCircle,
  CreditCard,
  Printer,
  FileText,
  Download,
  ShieldCheck,
  Copy,
  Search,
  SlidersHorizontal,
  Smartphone,
  ChevronDown,
  ChevronUp,
  Percent,
  MapPin,
  Bike,
  PackageCheck,
  Zap,
  FileSpreadsheet,
  Upload
} from 'lucide-react';
import { AuthSession, Category, CustomerRecord, DeliveryZone, NormalizedTenantCatalog, OptionGroup, OptionItem, Order, OrderStatus, PixGatewayConfig, Product, RestaurantTenant, UserRole } from '../types';
import { ThermalTicketModal } from './ThermalTicketModal';
import { ConsumerMenuView } from './ConsumerMenuView';
import { WhatsAppAutomationView } from './WhatsAppAutomationView';
import { OrderTrackingView } from './OrderTrackingView';
import { WhatsAppQrPairingModal } from './WhatsAppQrPairingModal';
import { AsaasSubscriptionBillingView } from './AsaasSubscriptionBillingView';
import { AuditedDashboardView } from './AuditedDashboardView';
import { CrmCustomerManagementView } from './CrmCustomerManagementView';
import { IfoodIntegrationView } from './IfoodIntegrationView';
import { TableWaiterManagementView } from './TableWaiterManagementView';
import {
  MenuSpreadsheetModal,
  ParsedRowPreview,
  parseSpreadsheetLines,
  parsePriceBRLToCents,
  parseOptionGroupsFromCell,
  escapeCsvCell,
  readUploadedSpreadsheetFile,
} from './MenuSpreadsheetModal';

interface RestaurantAdminViewProps {
  tenant: RestaurantTenant;
  orders: Order[];
  products: Product[];
  categories: Category[];
  customers: CustomerRecord[];
  allTenants?: RestaurantTenant[];
  catalogsByTenant?: Record<string, NormalizedTenantCatalog>;
  onCreateTenant?: (newTenant: RestaurantTenant) => void;
  onSelectTenant?: (tenant: RestaurantTenant) => void;
  onUpdateTenant: (updatedTenant: RestaurantTenant) => void;
  onUpdateOrderStatus: (orderId: string, nextStatus: OrderStatus) => void;
  onAddOrder?: (newOrder: Order) => void;
  onToggleProductAvailability: (productId: string) => void;
  onAddProduct: (newProduct: Product) => void;
  onUpdateProduct: (updatedProduct: Product) => void;
  onDeleteProduct: (productId: string) => void;
  onAddCategory: (categoryName: string) => void;
  onImportCatalog?: (newCategories: Category[], newProducts: Product[], mode: 'merge' | 'replace') => void;
  onSimulateEvolutionReconnect: () => void;
  authSession?: AuthSession | null;
  onOpenAuthPortal?: () => void;
  onOpenPublicMenu?: () => void;
}

export const RestaurantAdminView: React.FC<RestaurantAdminViewProps> = ({
  tenant,
  orders,
  products,
  categories,
  customers,
  allTenants = [],
  catalogsByTenant = {},
  onCreateTenant,
  onSelectTenant,
  onUpdateTenant,
  onUpdateOrderStatus,
  onAddOrder,
  onToggleProductAvailability,
  onAddProduct,
  onUpdateProduct,
  onDeleteProduct,
  onAddCategory,
  onImportCatalog,
  onSimulateEvolutionReconnect,
  authSession,
  onOpenAuthPortal,
  onOpenPublicMenu,
}) => {
  const isSuperAdmin = authSession?.user?.role === 'SUPER_ADMIN';
  const [publicLinkCopied, setPublicLinkCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'super_subscriptions' | 'kds' | 'tables' | 'menu' | 'categories' | 'settings' | 'billing' | 'whatsapp' | 'crm' | 'reports' | 'ifood'>(() =>
    authSession?.user?.role === 'SUPER_ADMIN' ? 'super_subscriptions' : 'menu'
  );
  const [printingOrder, setPrintingOrder] = useState<Order | null>(null);
  const [trackingOrderModal, setTrackingOrderModal] = useState<Order | null>(null);
  const [statusUpdateToast, setStatusUpdateToast] = useState<string | null>(null);
  const [testMsgStatus, setTestMsgStatus] = useState<string | null>(null);
  const [isQrPairingModalOpen, setIsQrPairingModalOpen] = useState(false);
  const [isTopBarHoursModalOpen, setIsTopBarHoursModalOpen] = useState(false);
  const [topBarDaysPreset, setTopBarDaysPreset] = useState('Segunda a Domingo');
  const [topBarOpenTime, setTopBarOpenTime] = useState('18:00');
  const [topBarCloseTime, setTopBarCloseTime] = useState('23:45');
  const [spreadsheetModalTab, setSpreadsheetModalTab] = useState<'export' | 'import' | null>(null);

  // Super Admin state for filtering and provisioning restaurants
  const [superAdminSearch, setSuperAdminSearch] = useState('');
  const [superAdminStatusFilter, setSuperAdminStatusFilter] = useState<'all' | 'active' | 'trial' | 'past_due'>('all');
  const [isCreatingNewTenant, setIsCreatingNewTenant] = useState(false);
  const [newTenantName, setNewTenantName] = useState('');
  const [newTenantSlug, setNewTenantSlug] = useState('');
  const [newTenantPhone, setNewTenantPhone] = useState('');
  const [newTenantPlanStatus, setNewTenantPlanStatus] = useState<'active' | 'trial'>('trial');
  const [superAdminActionNotice, setSuperAdminActionNotice] = useState<string | null>(null);

  // Dedicated 'Importação de Cardápio' Modal State
  const [isImportMenuModalOpen, setIsImportMenuModalOpen] = useState(false);
  const [importMenuMode, setImportMenuMode] = useState<'merge' | 'replace'>('merge');
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [importPreviewRows, setImportPreviewRows] = useState<ParsedRowPreview[]>([]);
  const [isDraggingImportFile, setIsDraggingImportFile] = useState(false);
  const importFileInputRef = React.useRef<HTMLInputElement | null>(null);

  // RBAC Role State (Proprietário, Gerente, Cozinha)
  const [userRole, setUserRole] = useState<UserRole>('owner');

  useEffect(() => {
    if (!authSession) return;
    if (authSession.user.role === 'SUPER_ADMIN') {
      setUserRole('owner');
      setActiveTab((prev) =>
        prev === 'menu' || prev === 'categories' || prev === 'kds' || prev === 'crm'
          ? 'super_subscriptions'
          : prev
      );
    } else if (authSession.user.role === 'KITCHEN_STAFF') {
      setUserRole('kitchen');
      setActiveTab('kds');
    } else {
      setUserRole('owner');
      setActiveTab((prev) => (prev === 'super_subscriptions' ? 'menu' : prev));
    }
  }, [authSession]);

  const handleKdsStatusChange = async (order: Order, nextStatus: OrderStatus) => {
    onUpdateOrderStatus(order.id, nextStatus);

    if (order.channel === 'IFOOD') {
      try {
        await fetch(`/api/v1/ifood/orders/${order.id}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nextStatus,
            tenantSlug: tenant.slug,
            ifoodOrderId: order.ifoodOrderId || order.id,
            orderType: order.type,
          }),
        });
      } catch {
        // Ignore network error in offline mode
      }
      const actionMap: Record<string, string> = {
        confirmed: '/confirm (Confirmado no iFood)',
        preparing: '/confirm (Em Preparo no iFood)',
        ready: order.type === 'pickup' ? '/readyToPickup (Pronto p/ Retirada no iFood)' : '/dispatch (Despachado no iFood)',
        delivered: 'Concluído no iFood',
        cancelled: '/requestCancellation (Cancelado no iFood)',
      };
      setStatusUpdateToast(
        `🔴 Pedido iFood #${order.ifoodDisplayId || order.orderNumber} sincronizado via API Oficial: ${actionMap[nextStatus] || nextStatus}!`
      );
    } else {
      setStatusUpdateToast(
        `Status do Pedido #${order.orderNumber} alterado para "${nextStatus}". Notificação disparada no WhatsApp de ${order.customerName} via Evolution API!`
      );
    }
    setTimeout(() => setStatusUpdateToast(null), 5000);
  };

  const handleQuickSimulateIfoodOrderInKds = async () => {
    try {
      const res = await fetch('/api/v1/ifood/simulate-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantSlug: tenant.slug,
          merchantId: tenant.ifoodConfig?.merchantId || `merch_${tenant.slug}`,
        }),
      });
      const data = await res.json();
      if (data.order && onAddOrder) {
        onAddOrder(data.order);
        setStatusUpdateToast(
          `🔴 Novo Pedido iFood #${data.order.ifoodDisplayId || data.order.orderNumber} (Código Coleta: ${data.order.ifoodPickupCode}) recebido no KDS!`
        );
        setTimeout(() => setStatusUpdateToast(null), 6000);
      }
    } catch {
      // Ignore error
    }
  };

  // Live Sync & Preview state
  const [liveSyncNotice, setLiveSyncNotice] = useState<string | null>(null);
  const [showLivePreviewSplit, setShowLivePreviewSplit] = useState(false);

  // Product Filters & Bulk adjustments
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all');
  const [isBulkAdjustOpen, setIsBulkAdjustOpen] = useState(false);
  const [bulkPercent, setBulkPercent] = useState('5');
  const [bulkCategory, setBulkCategory] = useState('all');

  // Product modal state (Add / Edit)
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [prodName, setProdName] = useState('');
  const [prodCategory, setProdCategory] = useState(categories[0]?.id || '');
  const [prodDescription, setProdDescription] = useState('');
  const [prodPriceReal, setProdPriceReal] = useState('32.90');
  const [prodImageUrl, setProdImageUrl] = useState('');
  const [prodOptionGroups, setProdOptionGroups] = useState<OptionGroup[]>([]);

  // Category modal state
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  // Settings form state
  const [settingsName, setSettingsName] = useState(tenant.name);
  const [settingsPhone, setSettingsPhone] = useState(tenant.phone);
  const [settingsAddress, setSettingsAddress] = useState(tenant.address);
  const [settingsHours, setSettingsHours] = useState(tenant.openingHoursText);
  const [settingsPrimaryColor, setSettingsPrimaryColor] = useState(tenant.primaryColor);
  const [settingsDeliveryFee, setSettingsDeliveryFee] = useState((tenant.deliveryFeeCents / 100).toFixed(2));
  const [settingsMinOrder, setSettingsMinOrder] = useState((tenant.minOrderCents / 100).toFixed(2));
  const [settingsIsOpen, setSettingsIsOpen] = useState(tenant.isOpen);
  const [settingsSuccessNotice, setSettingsSuccessNotice] = useState<string | null>(null);

  // Delivery Zones state
  const [deliveryZones, setDeliveryZones] = useState<DeliveryZone[]>(tenant.deliveryZones || []);
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneFee, setNewZoneFee] = useState('8.00');
  const [newZoneMinutes, setNewZoneMinutes] = useState('40');

  // Pix Key & Beneficiary Name Editor state (Cada restaurante define sua própria Chave Pix e Nome do Beneficiário)
  const [isEditingPixKey, setIsEditingPixKey] = useState(true);
  const [pixKey, setPixKey] = useState(
    tenant.pixKey || tenant.pixConfig?.pixKey || tenant.phone || ''
  );
  const [pixKeyType, setPixKeyType] = useState<PixGatewayConfig['pixKeyType']>(
    tenant.pixConfig?.pixKeyType || 'phone'
  );
  const [pixMerchantName, setPixMerchantName] = useState(
    tenant.pixBeneficiaryName ||
      tenant.pixConfig?.beneficiaryName ||
      tenant.pixConfig?.merchantName ||
      tenant.name ||
      'MEU RESTAURANTE'
  );
  const [pixMerchantCity, setPixMerchantCity] = useState(
    tenant.pixConfig?.merchantCity || 'SAO PAULO'
  );
  const [pixBankName, setPixBankName] = useState(
    tenant.pixConfig?.bankName || 'Conta Bancária do Proprietário'
  );
  const [pixProvider, setPixProvider] = useState<PixGatewayConfig['provider']>(
    tenant.pixConfig?.provider || 'direct_bank'
  );
  const [pixSaving, setPixSaving] = useState(false);
  const [pixSaveNotice, setPixSaveNotice] = useState<string | null>(null);

  useEffect(() => {
    setSettingsName(tenant.name);
    setSettingsPhone(tenant.phone);
    setSettingsAddress(tenant.address);
    setSettingsHours(tenant.openingHoursText);
    setSettingsPrimaryColor(tenant.primaryColor);
    setSettingsDeliveryFee((tenant.deliveryFeeCents / 100).toFixed(2));
    setSettingsMinOrder((tenant.minOrderCents / 100).toFixed(2));
    setSettingsIsOpen(tenant.isOpen);
    setDeliveryZones(tenant.deliveryZones || []);

    // Sync Pix Config when tenant switches or updates
    setPixKey(tenant.pixKey || tenant.pixConfig?.pixKey || tenant.phone || '');
    setPixKeyType(tenant.pixConfig?.pixKeyType || 'phone');
    setPixMerchantName(
      tenant.pixBeneficiaryName ||
        tenant.pixConfig?.beneficiaryName ||
        tenant.pixConfig?.merchantName ||
        tenant.name ||
        'MEU RESTAURANTE'
    );
    setPixMerchantCity(tenant.pixConfig?.merchantCity || 'SAO PAULO');
    setPixBankName(tenant.pixConfig?.bankName || 'Conta Bancária do Proprietário');
    setPixProvider(tenant.pixConfig?.provider || 'direct_bank');
  }, [tenant]);

  // Group orders by KDS status
  const ordersByStatus = useMemo(() => {
    return {
      received: orders.filter((o) => o.status === 'received'),
      confirmed: orders.filter((o) => o.status === 'confirmed'),
      preparing: orders.filter((o) => o.status === 'preparing'),
      ready: orders.filter((o) => o.status === 'ready'),
      delivered: orders.filter((o) => o.status === 'delivered'),
      cancelled: orders.filter((o) => o.status === 'cancelled'),
    };
  }, [orders]);

  // Real-time KDS SLA Timer (updates every 15 seconds)
  const [kdsNowMs, setKdsNowMs] = useState<number>(() => Date.now());
  const kdsOrderFirstSeenRef = React.useRef<Record<string, number>>({});

  useEffect(() => {
    const interval = setInterval(() => {
      setKdsNowMs(Date.now());
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const getOrderKdsTimerVisuals = (order: Order) => {
    const raw = (order.createdAt || '').trim();
    let elapsedMinutes: number | null = null;

    // 1. Check HH:MM or HH:MM:SS format (e.g., "19:42" or "20:15:30")
    const timeMatch = raw.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (timeMatch && !raw.includes('-') && !raw.includes('/')) {
      const hours = parseInt(timeMatch[1], 10);
      const minutes = parseInt(timeMatch[2], 10);
      const seconds = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
      const orderDate = new Date(kdsNowMs);
      orderDate.setHours(hours, minutes, seconds, 0);
      let targetMs = orderDate.getTime();
      // Handle midnight rollover if order was placed late yesterday
      if (targetMs > kdsNowMs + 60000) {
        targetMs -= 24 * 60 * 60 * 1000;
      }
      elapsedMinutes = Math.max(0, Math.floor((kdsNowMs - targetMs) / 60000));
    }

    // 2. Check ISO / full date string
    if (elapsedMinutes === null && raw) {
      const parsedMs = Date.parse(raw);
      if (!isNaN(parsedMs)) {
        elapsedMinutes = Math.max(0, Math.floor((kdsNowMs - parsedMs) / 60000));
      }
    }

    // 3. Check relative string like "Há 12 min"
    if (elapsedMinutes === null && raw) {
      const relMatch = raw.match(/(\d+)\s*min/i);
      if (relMatch) {
        const baseMins = parseInt(relMatch[1], 10);
        if (!kdsOrderFirstSeenRef.current[order.id]) {
          kdsOrderFirstSeenRef.current[order.id] = Date.now() - baseMins * 60000;
        }
        elapsedMinutes = Math.max(
          0,
          Math.floor((kdsNowMs - kdsOrderFirstSeenRef.current[order.id]) / 60000)
        );
      }
    }

    // 4. Fallback to first-seen timestamp in session
    if (elapsedMinutes === null) {
      if (!kdsOrderFirstSeenRef.current[order.id]) {
        kdsOrderFirstSeenRef.current[order.id] = Date.now();
      }
      elapsedMinutes = Math.max(
        0,
        Math.floor((kdsNowMs - kdsOrderFirstSeenRef.current[order.id]) / 60000)
      );
    }

    const label =
      elapsedMinutes === 0
        ? 'Há < 1 min'
        : elapsedMinutes === 1
        ? 'Há 1 min'
        : `Há ${elapsedMinutes} min`;

    // Color tiers:
    // 0-10 min (< 10): Verde (No prazo)
    // 10-20 min (10 to 19): Amarelo (Atenção)
    // 20+ min (>= 20): Vermelho (Crítico / Atrasado)
    if (elapsedMinutes < 10) {
      return {
        elapsedMinutes,
        label,
        tier: 'green' as const,
        tierLabel: '0-10 min',
        cardBgClass: 'bg-emerald-50/90 border-emerald-300 hover:border-emerald-400',
        dividerClass: 'border-emerald-200/80',
        badgeClass: 'bg-emerald-600 text-white border-emerald-700',
        dotClass: 'bg-emerald-200',
      };
    }

    if (elapsedMinutes < 20) {
      return {
        elapsedMinutes,
        label,
        tier: 'yellow' as const,
        tierLabel: '10-20 min',
        cardBgClass: 'bg-amber-50/95 border-amber-300 hover:border-amber-400',
        dividerClass: 'border-amber-200/80',
        badgeClass: 'bg-amber-500 text-neutral-950 border-amber-600',
        dotClass: 'bg-neutral-950',
      };
    }

    return {
      elapsedMinutes,
      label,
      tier: 'red' as const,
      tierLabel: '20+ min',
      cardBgClass: 'bg-rose-50/95 border-rose-300 hover:border-rose-400',
      dividerClass: 'border-rose-200/80',
      badgeClass: 'bg-rose-600 text-white border-rose-700 animate-pulse',
      dotClass: 'bg-white',
    };
  };

  // Dashboard Metrics
  const dashboardMetrics = useMemo(() => {
    const totalReceived = orders.length;
    const completedOrders = orders.filter((o) => o.status === 'delivered');
    const cancelledOrders = orders.filter((o) => o.status === 'cancelled');

    const totalConcludedRevenueCents = completedOrders.reduce((acc, o) => acc + o.totalCents, 0);
    const averageTicketCents =
      completedOrders.length > 0 ? Math.round(totalConcludedRevenueCents / completedOrders.length) : 0;
    const cancellationRate = totalReceived > 0 ? (cancelledOrders.length / totalReceived) * 100 : 0;

    return {
      totalReceived,
      completedCount: completedOrders.length,
      cancelledCount: cancelledOrders.length,
      totalConcludedRevenueCents,
      averageTicketCents,
      cancellationRate,
    };
  }, [orders]);

  const formatBRL = (cents: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
  };

  const sortedCategories = useMemo(() => {
    return [...categories].sort((a, b) => a.order - b.order);
  }, [categories]);

  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState<string>('');

  const handleMoveCategoryOrder = (catId: string, direction: 'up' | 'down') => {
    const idx = sortedCategories.findIndex((c) => c.id === catId);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sortedCategories.length) return;

    const reordered = [...sortedCategories];
    const temp = reordered[idx];
    reordered[idx] = reordered[swapIdx];
    reordered[swapIdx] = temp;

    const normalized = reordered.map((c, i) => ({ ...c, order: i + 1 }));
    if (onImportCatalog) {
      onImportCatalog(normalized, products, 'replace');
    }
    triggerSyncNotice(
      `Categoria "${temp.name}" movida para a ${swapIdx + 1}ª posição do cardápio!`
    );
  };

  const handleSaveCategoryRename = (catId: string) => {
    const trimmed = editingCategoryName.trim();
    if (!trimmed) {
      setEditingCategoryId(null);
      return;
    }
    const updated = sortedCategories.map((c, i) =>
      c.id === catId ? { ...c, name: trimmed, order: i + 1 } : { ...c, order: i + 1 }
    );
    if (onImportCatalog) {
      onImportCatalog(updated, products, 'replace');
    }
    setEditingCategoryId(null);
    triggerSyncNotice(`Categoria renomeada para "${trimmed}" com sucesso!`);
  };

  const handleDeleteCategoryItem = (cat: Category) => {
    const remainingCats = sortedCategories
      .filter((c) => c.id !== cat.id)
      .map((c, i) => ({ ...c, order: i + 1 }));
    const fallbackCatId = remainingCats[0]?.id;
    const updatedProducts = fallbackCatId
      ? products.map((p) => (p.categoryId === cat.id ? { ...p, categoryId: fallbackCatId } : p))
      : products.filter((p) => p.categoryId !== cat.id);

    if (onImportCatalog) {
      onImportCatalog(remainingCats, updatedProducts, 'replace');
    }
    if (selectedCategoryFilter === cat.id) {
      setSelectedCategoryFilter('all');
    }
    triggerSyncNotice(`Categoria "${cat.name}" removida e cardápio reorganizado!`);
  };

  const filteredProducts = useMemo(() => {
    return products.filter((prod) => {
      const matchesSearch =
        productSearchQuery.trim() === '' ||
        prod.name.toLowerCase().includes(productSearchQuery.toLowerCase()) ||
        prod.description.toLowerCase().includes(productSearchQuery.toLowerCase());
      const matchesCat = selectedCategoryFilter === 'all' || prod.categoryId === selectedCategoryFilter;
      return matchesSearch && matchesCat;
    });
  }, [products, productSearchQuery, selectedCategoryFilter]);

  const handleOpenAddProduct = (preselectCatId?: string) => {
    setEditingProductId(null);
    setProdName('');
    setProdCategory(
      typeof preselectCatId === 'string' && preselectCatId
        ? preselectCatId
        : sortedCategories[0]?.id || categories[0]?.id || ''
    );
    setProdDescription('');
    setProdPriceReal('34.90');
    setProdImageUrl('');
    setProdOptionGroups([
      {
        id: `opt_${Date.now()}`,
        name: 'Ponto / Variação',
        required: true,
        minSelections: 1,
        maxSelections: 1,
        items: [
          { id: 'opt_item_1', name: 'Padrão da Casa', priceCents: 0 },
          { id: 'opt_item_2', name: 'Bem Passado', priceCents: 0 },
        ],
      },
    ]);
    setIsProductModalOpen(true);
  };

  const handleOpenEditProduct = (prod: Product) => {
    setEditingProductId(prod.id);
    setProdName(prod.name);
    setProdCategory(prod.categoryId);
    setProdDescription(prod.description);
    setProdPriceReal((prod.priceCents / 100).toFixed(2));
    setProdImageUrl(prod.imageUrl || '');
    setProdOptionGroups(prod.optionGroups ? JSON.parse(JSON.stringify(prod.optionGroups)) : []);
    setIsProductModalOpen(true);
  };

  const triggerSyncNotice = (msg: string) => {
    setLiveSyncNotice(msg);
    setTimeout(() => setLiveSyncNotice(null), 4500);
  };

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    const priceCents = Math.round(parseFloat(prodPriceReal.replace(',', '.')) * 100) || 0;

    if (editingProductId) {
      // Edit existing
      const updated: Product = {
        id: editingProductId,
        categoryId: prodCategory,
        name: prodName.trim(),
        description: prodDescription.trim(),
        priceCents,
        imageUrl: prodImageUrl.trim() || undefined,
        isAvailable: true,
        optionGroups: prodOptionGroups,
      };
      onUpdateProduct(updated);
      triggerSyncNotice(`Prato "${updated.name}" atualizado com sucesso no cardápio de ${tenant.name}!`);
    } else {
      // Create new
      const created: Product = {
        id: `prod_${Date.now()}`,
        categoryId: prodCategory,
        name: prodName.trim(),
        description: prodDescription.trim(),
        priceCents,
        imageUrl: prodImageUrl.trim() || undefined,
        isAvailable: true,
        optionGroups: prodOptionGroups,
      };
      onAddProduct(created);
      triggerSyncNotice(`Novo prato "${created.name}" cadastrado e já visível no cardápio público!`);
    }

    setIsProductModalOpen(false);
  };

  const handleDuplicateProduct = (prod: Product) => {
    const duplicated: Product = {
      ...prod,
      id: `prod_${Date.now()}`,
      name: `${prod.name} (Cópia)`,
      isAvailable: true,
    };
    onAddProduct(duplicated);
    triggerSyncNotice(`Produto duplicado como "${duplicated.name}". Você já pode editar o preço e nome.`);
  };

  const handleToggleProductWithNotice = (prodId: string) => {
    const item = products.find((p) => p.id === prodId);
    onToggleProductAvailability(prodId);
    const nextState = item ? !item.isAvailable : true;
    triggerSyncNotice(
      nextState
        ? `"${item?.name}" reativado! Os clientes já podem fazer pedidos.`
        : `"${item?.name}" pausado (Esgotado temporariamente). O cliente verá aviso no cardápio.`
    );
  };

  const handleApplyBulkPriceAdjustment = () => {
    const percent = parseFloat(bulkPercent);
    if (isNaN(percent) || percent === 0) return;

    const multiplier = 1 + percent / 100;
    let affectedCount = 0;

    products.forEach((prod) => {
      if (bulkCategory === 'all' || prod.categoryId === bulkCategory) {
        const newPrice = Math.max(100, Math.round(prod.priceCents * multiplier));
        onUpdateProduct({
          ...prod,
          priceCents: newPrice,
        });
        affectedCount++;
      }
    });

    setIsBulkAdjustOpen(false);
    triggerSyncNotice(`Reajuste de ${percent > 0 ? '+' : ''}${percent}% aplicado a ${affectedCount} produtos!`);
  };

  // --- DEDICATED MENU IMPORT MODAL HANDLERS ---
  const normalizeImportStr = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

  const handleProcessImportSpreadsheet = (rawText: string, sourceFile: string) => {
    setImportFileName(sourceFile);
    if (!rawText.trim()) {
      setImportPreviewRows([]);
      return;
    }

    const rawRows = parseSpreadsheetLines(rawText);
    if (rawRows.length === 0) {
      setImportPreviewRows([]);
      return;
    }

    const firstRowLower = rawRows[0].map((c) => normalizeImportStr(c));
    const hasHeader =
      firstRowLower.some((col) => col.includes('categoria') || col.includes('category')) ||
      firstRowLower.some((col) => col.includes('produto') || col.includes('nome') || col.includes('preco'));

    let idxOrder = 0;
    let idxCategory = 1;
    let idxProductName = 2;
    let idxDescription = 3;
    let idxPrice = 4;
    let idxAvailable = 5;
    let idxFeatured = 6;
    let idxImage = 7;
    let idxOptions = 8;

    if (hasHeader) {
      const usedIndices = new Set<number>();
      const findCol = (
        exactNames: string[],
        partialKeywords: string[],
        excludeKeywords: string[],
        fallback: number
      ) => {
        const exactIdx = firstRowLower.findIndex(
          (h, idx) => !usedIndices.has(idx) && exactNames.includes(h)
        );
        if (exactIdx >= 0) {
          usedIndices.add(exactIdx);
          return exactIdx;
        }
        const partialIdx = firstRowLower.findIndex(
          (h, idx) =>
            !usedIndices.has(idx) &&
            !excludeKeywords.some((ex) => h.includes(ex)) &&
            partialKeywords.some((kw) => h.includes(kw))
        );
        if (partialIdx >= 0) {
          usedIndices.add(partialIdx);
          return partialIdx;
        }
        return fallback;
      };

      const hasProductCol = firstRowLower.some(
        (h) =>
          h === 'nome_produto' ||
          h === 'produto' ||
          h === 'prato' ||
          h === 'item' ||
          (h.includes('produto') && !h.includes('total'))
      );

      idxOrder = findCol(
        ['ordem_categoria', 'ordem', 'order', 'posicao'],
        ['ordem', 'order', 'posicao'],
        [],
        0
      );
      idxCategory = findCol(
        ['categoria', 'nome_categoria', 'category', 'secao'],
        ['categoria', 'category', 'secao'],
        ['ordem', 'order', 'posicao', 'id_'],
        firstRowLower.length === 1 ? 0 : 1
      );

      if (!hasProductCol && firstRowLower.length <= 3) {
        idxProductName = -1;
        idxDescription = -1;
        idxPrice = -1;
        idxAvailable = -1;
        idxFeatured = -1;
        idxImage = -1;
        idxOptions = -1;
      } else {
        idxProductName = findCol(
          ['nome_produto', 'produto', 'prato', 'nome', 'item'],
          ['nome_produto', 'produto', 'prato', 'item', 'nome'],
          ['categoria', 'category', 'ordem', 'order'],
          2
        );
        idxDescription = findCol(
          ['descricao', 'description', 'ingredientes', 'detalhe'],
          ['descricao', 'description', 'ingredientes', 'detalhe'],
          [],
          3
        );
        idxPrice = findCol(
          ['preco_brl', 'preco', 'valor', 'price'],
          ['preco', 'valor', 'price'],
          [],
          4
        );
        idxAvailable = findCol(
          ['disponivel', 'ativo', 'status', 'available'],
          ['disponivel', 'ativo', 'status', 'available'],
          [],
          5
        );
        idxFeatured = findCol(
          ['destaque', 'featured', 'promocao'],
          ['destaque', 'featured', 'promocao'],
          [],
          6
        );
        idxImage = findCol(
          ['imagem_url', 'imagem', 'foto', 'image', 'url'],
          ['imagem', 'foto', 'image', 'url'],
          [],
          7
        );
        idxOptions = findCol(
          ['adicionais', 'opcoes', 'complementos', 'options'],
          ['adicionais', 'opcoes', 'complementos', 'options'],
          [],
          8
        );
      }
    }

    const dataRows = hasHeader ? rawRows.slice(1) : rawRows;
    const previews: ParsedRowPreview[] = [];
    const categoryOrderTracker = new Map<string, number>();

    dataRows.forEach((cols, idx) => {
      const rowNumber = hasHeader ? idx + 2 : idx + 1;
      const getCol = (cIdx: number) => (cIdx >= 0 && cIdx < cols.length ? cols[cIdx]?.trim() || '' : '');

      const orderRaw = getCol(idxOrder);
      const categoryName = getCol(idxCategory);
      const productName = getCol(idxProductName);
      const description = getCol(idxDescription);
      const priceRaw = getCol(idxPrice);
      const availableRaw = getCol(idxAvailable).toUpperCase();
      const featuredRaw = getCol(idxFeatured).toUpperCase();
      const imageUrl = getCol(idxImage);
      const optionsRaw = getCol(idxOptions);

      const normCatKey = normalizeImportStr(categoryName);
      const explicitOrder =
        !isNaN(Number(orderRaw)) && Number(orderRaw) > 0 ? parseInt(orderRaw, 10) : null;

      let categoryOrder = 1;
      if (normCatKey) {
        if (categoryOrderTracker.has(normCatKey)) {
          categoryOrder = explicitOrder ?? categoryOrderTracker.get(normCatKey)!;
        } else {
          categoryOrder = explicitOrder ?? categoryOrderTracker.size + 1;
          categoryOrderTracker.set(normCatKey, categoryOrder);
        }
      } else {
        categoryOrder = explicitOrder ?? idx + 1;
      }

      if (!categoryName && !productName) return;

      if (!categoryName) {
        previews.push({
          rowNumber,
          categoryOrder,
          categoryName: 'Sem Categoria',
          productName: productName || '(Sem nome)',
          description,
          priceCents: 0,
          isAvailable: true,
          isFeatured: false,
          imageUrl,
          optionGroups: [],
          status: 'error',
          errorMessage: 'Categoria obrigatória ausente',
        });
        return;
      }

      if (!productName) {
        previews.push({
          rowNumber,
          categoryOrder,
          categoryName,
          productName: '',
          description: '',
          priceCents: 0,
          isAvailable: true,
          isFeatured: false,
          imageUrl: '',
          optionGroups: [],
          status: 'category_only',
        });
        return;
      }

      const priceCents = parsePriceBRLToCents(priceRaw);
      if (priceCents <= 0) {
        previews.push({
          rowNumber,
          categoryOrder,
          categoryName,
          productName,
          description,
          priceCents: 0,
          isAvailable: true,
          isFeatured: false,
          imageUrl,
          optionGroups: [],
          status: 'error',
          errorMessage: `Preço inválido ("${priceRaw || 'vazio'}")`,
        });
        return;
      }

      const isAvailable =
        availableRaw === '' ||
        availableRaw === 'SIM' ||
        availableRaw === 'S' ||
        availableRaw === 'TRUE' ||
        availableRaw === '1' ||
        availableRaw === 'ATIVO' ||
        availableRaw === 'DISPONIVEL';

      const isFeatured =
        featuredRaw === 'SIM' ||
        featuredRaw === 'S' ||
        featuredRaw === 'TRUE' ||
        featuredRaw === '1' ||
        featuredRaw === 'DESTAQUE';

      const optionGroups = parseOptionGroupsFromCell(optionsRaw);

      previews.push({
        rowNumber,
        categoryOrder,
        categoryName,
        productName,
        description,
        priceCents,
        isAvailable,
        isFeatured,
        imageUrl,
        optionGroups,
        status: 'valid',
      });
    });

    setImportPreviewRows(previews);
  };

  const [importUploadError, setImportUploadError] = useState<string | null>(null);

  const handleImportFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportUploadError(null);
    try {
      const content = await readUploadedSpreadsheetFile(file);
      handleProcessImportSpreadsheet(content, file.name);
    } catch (err) {
      setImportUploadError(
        err instanceof Error
          ? err.message
          : 'Não foi possível ler o arquivo no celular. Selecione uma planilha (.CSV, .XLSX, .XLS ou .TXT).'
      );
    } finally {
      e.target.value = '';
    }
  };

  const handleImportFileDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingImportFile(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    setImportUploadError(null);
    try {
      const content = await readUploadedSpreadsheetFile(file);
      handleProcessImportSpreadsheet(content, file.name);
    } catch (err) {
      setImportUploadError(
        err instanceof Error
          ? err.message
          : 'Não foi possível ler o arquivo selecionado.'
      );
    }
  };

  const handleProductImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = String(ev.target?.result || '');
      if (!dataUrl) return;

      // Compress/resize image via canvas so mobile camera photos (4MB+) fit cleanly in state/localStorage
      const img = new Image();
      img.onload = () => {
        const maxDim = 800;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.82);
          setProdImageUrl(compressedDataUrl);
        } else {
          setProdImageUrl(dataUrl);
        }
      };
      img.onerror = () => {
        setProdImageUrl(dataUrl);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleLoadSampleImportTable = () => {
    const sampleCsv = [
      ['Ordem_Categoria', 'Categoria', 'Nome_Produto', 'Descricao', 'Preco_BRL', 'Disponivel', 'Destaque', 'Imagem_URL', 'Adicionais'],
      [
        '1',
        'Smash Burgers Artesanais',
        'Duplo Smash Bacon Especial',
        'Dois blends bovinos de 90g na chapa, queijo cheddar inglês, bacon crocante e molho da casa no pão brioche.',
        '36,90',
        'SIM',
        'SIM',
        'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600',
        'Ponto da Carne (Obrigatorio,1,1): Ao Ponto=0,00 | Bem Passado=0,00 || Adicionais (Opcional,0,3): Bacon Extra=6,00 | Cheddar Extra=5,00',
      ],
      [
        '1',
        'Smash Burgers Artesanais',
        'Trufa & Cheddar Burger',
        'Blend artesanal 160g, cheddar cremoso, cebola caramelizada e maionese trufada.',
        '39,90',
        'SIM',
        'NAO',
        'https://images.unsplash.com/photo-1550547660-d9450f859349?w=600',
        '',
      ],
      [
        '2',
        'Porções & Entradas',
        'Batata Rústica com Cheddar e Bacon',
        'Porção de 350g de batatas fritas crocantes cobertas com molho cheddar e farofa de bacon.',
        '27,90',
        'SIM',
        'SIM',
        'https://images.unsplash.com/photo-1576107232684-1279f3908594?w=600',
        '',
      ],
      [
        '3',
        'Bebidas Geladas',
        'Refrigerante Lata 350ml',
        'Coca-Cola Original, Coca-Cola Zero ou Guaraná Antarctica lata 350ml.',
        '7,50',
        'SIM',
        'NAO',
        'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600',
        'Escolha o Sabor (Obrigatorio,1,1): Coca-Cola Original=0,00 | Coca-Cola Zero=0,00 | Guaraná=0,00',
      ],
    ]
      .map((row) => row.map((cell) => escapeCsvCell(cell, ';')).join(';'))
      .join('\n');

    handleProcessImportSpreadsheet(sampleCsv, 'cardapio-exemplo-importacao.csv');
  };

  const organizedImportPreviewCategories = useMemo(() => {
    const validRows = importPreviewRows.filter(
      (r) => r.status === 'valid' || r.status === 'category_only'
    );
    const map = new Map<string, { name: string; order: number; count: number }>();
    validRows.forEach((r) => {
      const norm = normalizeImportStr(r.categoryName);
      if (!map.has(norm)) {
        map.set(norm, {
          name: r.categoryName.trim(),
          order: r.categoryOrder,
          count: r.status === 'valid' ? 1 : 0,
        });
      } else {
        const entry = map.get(norm)!;
        if (r.status === 'valid') entry.count += 1;
      }
    });
    return Array.from(map.values())
      .sort((a, b) => a.order - b.order)
      .map((item, idx) => ({ ...item, order: idx + 1 }));
  }, [importPreviewRows]);

  const handleConfirmMenuImportModal = () => {
    const validRows = importPreviewRows.filter((r) => r.status === 'valid' || r.status === 'category_only');
    const validProductRows = importPreviewRows.filter((r) => r.status === 'valid');
    if (validRows.length === 0) return;

    const cleanedExistingCategories =
      importMenuMode === 'replace'
        ? []
        : categories.filter((c) => {
            const isNumericCorrupted = /^\d+$/.test(c.name.trim());
            if (isNumericCorrupted) return false;
            const hasProds = products.some((p) => p.categoryId === c.id);
            const isImportedToo = validRows.some(
              (r) => normalizeImportStr(r.categoryName) === normalizeImportStr(c.name)
            );
            return hasProds || isImportedToo;
          });

    const validExistingCatIds = new Set(cleanedExistingCategories.map((c) => c.id));
    const baseCategories: Category[] = [...cleanedExistingCategories];
    const baseProducts: Product[] =
      importMenuMode === 'replace'
        ? []
        : products.filter((p) => validExistingCatIds.has(p.categoryId));

    const categoryMapByNormName = new Map<string, Category>();
    baseCategories.forEach((cat) => {
      categoryMapByNormName.set(normalizeImportStr(cat.name), { ...cat });
    });

    const importedOrderMap = new Map<string, number>();
    validRows.forEach((row) => {
      const normCat = normalizeImportStr(row.categoryName);
      if (!importedOrderMap.has(normCat)) {
        importedOrderMap.set(normCat, row.categoryOrder || importedOrderMap.size + 1);
      }
    });

    validRows.forEach((row, idx) => {
      const normCat = normalizeImportStr(row.categoryName);
      if (!categoryMapByNormName.has(normCat)) {
        const newCat: Category = {
          id: `cat_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
          name: row.categoryName.trim(),
          order: importedOrderMap.get(normCat) || categoryMapByNormName.size + 1,
        };
        categoryMapByNormName.set(normCat, newCat);
      } else {
        const existingCat = categoryMapByNormName.get(normCat)!;
        existingCat.name = row.categoryName.trim();
        if (importedOrderMap.has(normCat)) {
          existingCat.order = importedOrderMap.get(normCat)!;
        }
      }
    });

    const allCats = Array.from(categoryMapByNormName.values());
    allCats.sort((a, b) => {
      const aInSheet = importedOrderMap.has(normalizeImportStr(a.name));
      const bInSheet = importedOrderMap.has(normalizeImportStr(b.name));
      if (aInSheet && !bInSheet) return -1;
      if (!aInSheet && bInSheet) return 1;
      return a.order - b.order;
    });

    const finalCategories: Category[] = allCats.map((cat, index) => ({
      ...cat,
      order: index + 1,
    }));

    finalCategories.forEach((cat) => {
      categoryMapByNormName.set(normalizeImportStr(cat.name), cat);
    });

    const finalProducts = [...baseProducts];

    validProductRows.forEach((row, idx) => {
      const normCat = normalizeImportStr(row.categoryName);
      const targetCat = categoryMapByNormName.get(normCat)!;
      const normProd = normalizeImportStr(row.productName);

      const existingProdIndex = finalProducts.findIndex(
        (p) => normalizeImportStr(p.name) === normProd
      );

      if (existingProdIndex >= 0) {
        finalProducts[existingProdIndex] = {
          ...finalProducts[existingProdIndex],
          categoryId: targetCat.id,
          name: row.productName.trim(),
          description: row.description.trim(),
          priceCents: row.priceCents,
          isAvailable: row.isAvailable,
          isFeatured: row.isFeatured,
          imageUrl: row.imageUrl || finalProducts[existingProdIndex].imageUrl,
          optionGroups:
            row.optionGroups.length > 0
              ? row.optionGroups
              : finalProducts[existingProdIndex].optionGroups,
        };
      } else {
        finalProducts.push({
          id: `prod_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
          categoryId: targetCat.id,
          name: row.productName.trim(),
          description: row.description.trim(),
          priceCents: row.priceCents,
          isAvailable: row.isAvailable,
          isFeatured: row.isFeatured,
          imageUrl: row.imageUrl || undefined,
          optionGroups: row.optionGroups.length > 0 ? row.optionGroups : undefined,
        });
      }
    });

    const catOrderById = new Map(finalCategories.map((c) => [c.id, c.order]));
    finalProducts.sort(
      (a, b) => (catOrderById.get(a.categoryId) ?? 999) - (catOrderById.get(b.categoryId) ?? 999)
    );

    if (onImportCatalog) {
      onImportCatalog(finalCategories, finalProducts, importMenuMode);
    } else {
      finalCategories.forEach((cat) => {
        if (!categories.some((c) => c.id === cat.id)) {
          onAddCategory(cat.name);
        }
      });
      finalProducts.forEach((prod) => {
        if (products.some((p) => p.id === prod.id)) {
          onUpdateProduct(prod);
        } else {
          onAddProduct(prod);
        }
      });
    }

    triggerSyncNotice(
      importMenuMode === 'replace'
        ? `Cardápio substituído e organizado: ${finalCategories.length} categorias (${finalCategories.map((c) => c.name).join(', ')}) e ${finalProducts.length} produtos ativos!`
        : `Cardápio importado e organizado: ${finalCategories.length} categorias (${finalCategories.map((c) => c.name).join(', ')}) e ${finalProducts.length} produtos sincronizados!`
    );

    setIsImportMenuModalOpen(false);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const deliveryFeeCents = Math.round(parseFloat(settingsDeliveryFee.replace(',', '.')) * 100) || 0;
    const minOrderCents = Math.round(parseFloat(settingsMinOrder.replace(',', '.')) * 100) || 0;

    const cleanPixKey = pixKey.trim() || settingsPhone.replace(/\D/g, '');
    const cleanBeneficiary = (pixMerchantName.trim() || settingsName.trim() || 'MEU RESTAURANTE').slice(0, 60);

    const updatedPixConfig: PixGatewayConfig = {
      provider: 'direct_bank',
      pixKey: cleanPixKey,
      pixKeyType: pixKeyType,
      beneficiaryName: cleanBeneficiary,
      merchantName: cleanBeneficiary.slice(0, 25),
      merchantCity: (pixMerchantCity.trim() || 'SAO PAULO').slice(0, 15).toUpperCase(),
      bankName: pixBankName.trim() || 'Conta Bancária do Proprietário',
      autoApproveWebhook: true,
    };

    const updated: RestaurantTenant = {
      ...tenant,
      name: settingsName.trim(),
      phone: settingsPhone.replace(/\D/g, ''),
      address: settingsAddress.trim(),
      openingHoursText: settingsHours.trim(),
      primaryColor: settingsPrimaryColor,
      deliveryFeeCents,
      minOrderCents,
      isOpen: settingsIsOpen,
      deliveryZones,
      pixKey: cleanPixKey,
      pixBeneficiaryName: cleanBeneficiary,
      pixConfig: updatedPixConfig,
    };

    onUpdateTenant(updated);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authSession?.token) {
        headers['Authorization'] = `Bearer ${authSession.token}`;
      }
      await Promise.all([
        fetch(`/api/v1/tenants/${tenant.slug}/settings`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            name: updated.name,
            phone: updated.phone,
            address: updated.address,
            primaryColor: updated.primaryColor,
            isOpen: updated.isOpen,
            openingHoursText: updated.openingHoursText,
            deliveryFeeCents: updated.deliveryFeeCents,
            minOrderCents: updated.minOrderCents,
            deliveryZones: updated.deliveryZones,
            pixKey: cleanPixKey,
            pixBeneficiaryName: cleanBeneficiary,
            pixConfig: updatedPixConfig,
          }),
        }),
        fetch(`/api/v1/tenants/${tenant.slug}/pix-config`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(updatedPixConfig),
        }),
      ]);
    } catch {
      // Local state and localStorage are already updated
    }

    setSettingsSuccessNotice(
      `Configurações e Chave Pix (${cleanPixKey} · Beneficiário: ${cleanBeneficiary}) salvas com sucesso no restaurante atual!`
    );
    triggerSyncNotice(
      `Chave Pix (${cleanPixKey}) e Nome do Beneficiário (${cleanBeneficiary}) atualizados para o checkout de ${updated.name}!`
    );
    setTimeout(() => setSettingsSuccessNotice(null), 4500);
  };

  const handleSavePixConfig = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!pixKey.trim()) return;

    setPixSaving(true);
    try {
      const cleanPixKey = pixKey.trim();
      const cleanBeneficiary = (pixMerchantName.trim() || tenant.name || 'MEU RESTAURANTE').slice(0, 60);

      const payload: PixGatewayConfig = {
        provider: 'direct_bank',
        pixKey: cleanPixKey,
        pixKeyType: pixKeyType,
        beneficiaryName: cleanBeneficiary,
        merchantName: cleanBeneficiary.slice(0, 25),
        merchantCity: (pixMerchantCity.trim() || 'SAO PAULO').slice(0, 15).toUpperCase(),
        bankName: pixBankName.trim() || 'Conta Bancária do Proprietário',
        autoApproveWebhook: true,
      };

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authSession?.token) {
        headers['Authorization'] = `Bearer ${authSession.token}`;
      }

      await fetch(`/api/v1/tenants/${tenant.slug}/pix-config`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(payload),
      });

      const updatedTenant: RestaurantTenant = {
        ...tenant,
        pixKey: cleanPixKey,
        pixBeneficiaryName: cleanBeneficiary,
        pixConfig: payload,
      };

      onUpdateTenant(updatedTenant);
      setPixSaveNotice(
        `Chave Pix "${cleanPixKey}" e Beneficiário "${cleanBeneficiary}" salvos com sucesso para ${tenant.name}!`
      );
      triggerSyncNotice(
        `✅ Chave Pix ("${cleanPixKey}") e Nome do Beneficiário ("${cleanBeneficiary}") salvos! O QR Code Pix do checkout já utiliza esses dados.`
      );
      setStatusUpdateToast(
        `✅ Chave Pix de ${tenant.name} atualizada para "${cleanPixKey}" (${cleanBeneficiary})!`
      );
      setTimeout(() => {
        setPixSaveNotice(null);
        setStatusUpdateToast(null);
      }, 5000);
    } catch (err) {
      console.error('Erro ao salvar Pix config:', err);
      setStatusUpdateToast('Erro ao salvar chave Pix.');
      setTimeout(() => setStatusUpdateToast(null), 3000);
    } finally {
      setPixSaving(false);
    }
  };

  const handleAddDeliveryZone = () => {
    if (!newZoneName.trim()) return;
    const feeCents = Math.round(parseFloat(newZoneFee.replace(',', '.')) * 100) || 0;
    const minutes = parseInt(newZoneMinutes, 10) || 40;
    const newZone: DeliveryZone = {
      id: `zone_${Date.now()}`,
      name: newZoneName.trim(),
      feeCents,
      estimatedMinutes: minutes,
      active: true,
    };
    const nextZones = [...deliveryZones, newZone];
    setDeliveryZones(nextZones);
    setNewZoneName('');
    onUpdateTenant({ ...tenant, deliveryZones: nextZones });
    triggerSyncNotice(`Bairro / Região "${newZone.name}" adicionado com taxa de R$ ${(feeCents / 100).toFixed(2)}.`);
  };

  const handleToggleDeliveryZone = (zoneId: string) => {
    const nextZones = deliveryZones.map((z) => (z.id === zoneId ? { ...z, active: !z.active } : z));
    setDeliveryZones(nextZones);
    onUpdateTenant({ ...tenant, deliveryZones: nextZones });
  };

  const handleRemoveDeliveryZone = (zoneId: string) => {
    const nextZones = deliveryZones.filter((z) => z.id !== zoneId);
    setDeliveryZones(nextZones);
    onUpdateTenant({ ...tenant, deliveryZones: nextZones });
  };

  const handleCreateCategorySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    onAddCategory(newCategoryName.trim());
    setNewCategoryName('');
    setIsCategoryModalOpen(false);
  };

  const handleSendTestWhatsApp = () => {
    setTestMsgStatus('Enviando via Evolution API...');
    setTimeout(() => {
      setTestMsgStatus('Mensagem de teste enviada com sucesso no WhatsApp!');
      setTimeout(() => setTestMsgStatus(null), 3000);
    }, 800);
  };

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden min-h-[720px] flex flex-col shadow-xs">
      {/* Top Header: Dedicated Global Console for Super Admin vs Restaurant Profile for Tenants */}
      {isSuperAdmin ? (
        <div className="bg-slate-900 text-white border-b border-slate-800 px-6 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-base shadow-sm shrink-0 border border-indigo-400/30">
              👑
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-sm sm:text-base font-bold text-white tracking-tight">
                  Central Super Admin · Gestão Global da Plataforma
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 uppercase tracking-wider">
                  Acesso Total Multi-Tenant
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Acompanhamento de assinaturas, relatórios de vendas e configuração completa da aplicação e de qualquer restaurante.
              </p>
            </div>
          </div>

          {/* Global Restaurant Selector for Super Admin */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2 bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-1.5 text-xs">
              <span className="text-slate-400 font-medium whitespace-nowrap">Restaurante em Foco:</span>
              <select
                value={tenant.slug}
                onChange={(e) => {
                  const found = (allTenants.length > 0 ? allTenants : [tenant]).find((t) => t.slug === e.target.value);
                  if (found && onSelectTenant) onSelectTenant(found);
                }}
                className="bg-slate-900 border border-slate-700 text-white text-xs rounded-lg px-2.5 py-1 font-semibold focus:outline-none focus:border-indigo-500"
              >
                {(allTenants.length > 0 ? allTenants : [tenant]).map((t) => (
                  <option key={t.slug} value={t.slug}>
                    {t.name} ({t.slug})
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => {
                setActiveTab('super_subscriptions');
                setIsCreatingNewTenant(true);
              }}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Novo Restaurante</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className="w-10 h-10 rounded-lg text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0"
              style={{ backgroundColor: tenant.primaryColor }}
            >
              {tenant.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="font-bold text-slate-900">{tenant.name}</span>
                <span aria-hidden="true">·</span>
                <span className="text-blue-700 font-medium">Assinatura Ativa</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <span className="text-[11px] text-slate-500 font-medium">Visualização da Equipe:</span>
                <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setUserRole('owner')}
                    className={`px-2 py-0.5 rounded-md font-medium transition-colors ${
                      userRole === 'owner'
                        ? 'bg-white text-blue-700 shadow-2xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    👑 Proprietário (Total)
                  </button>
                  <button
                    type="button"
                    onClick={() => setUserRole('manager')}
                    className={`px-2 py-0.5 rounded-md font-medium transition-colors ${
                      userRole === 'manager'
                        ? 'bg-white text-blue-700 shadow-2xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    📋 Gerente
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUserRole('kitchen');
                      setActiveTab('kds');
                    }}
                    className={`px-2 py-0.5 rounded-md font-medium transition-colors ${
                      userRole === 'kitchen'
                        ? 'bg-white text-blue-700 shadow-2xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    🍳 Cozinha (KDS)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUserRole('waiter');
                      setActiveTab('tables');
                    }}
                    className={`px-2 py-0.5 rounded-md font-medium transition-colors ${
                      userRole === 'waiter'
                        ? 'bg-white text-blue-700 shadow-2xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    🧑‍🍳 Garçom (Salão)
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Botão para Configurar o Horário do Cardápio na Barra Superior */}
            <button
              type="button"
              onClick={() => {
                const raw = tenant.openingHoursText || 'Segunda a Domingo: 18:00 às 23:45';
                setSettingsHours(raw);
                setSettingsIsOpen(tenant.isOpen ?? true);
                const match = raw.match(/^(.*?):\s*(\d{2}:\d{2})\s*(?:às|as|-|até)\s*(\d{2}:\d{2})$/i);
                if (match) {
                  setTopBarDaysPreset(match[1].trim());
                  setTopBarOpenTime(match[2]);
                  setTopBarCloseTime(match[3]);
                }
                setIsTopBarHoursModalOpen(true);
              }}
              className="flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-xs cursor-pointer transition-colors shadow-2xs group"
              title="Clique para configurar o horário do cardápio e status Aberto/Fechado na barra superior"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  tenant.isOpen ? 'bg-emerald-500 ring-2 ring-emerald-200' : 'bg-rose-500 ring-2 ring-rose-200'
                }`}
              />
              <span className="font-semibold text-slate-800">
                {tenant.isOpen ? 'Aberto' : 'Fechado'}
              </span>
              <span className="text-slate-300">|</span>
              <Clock className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span className="text-slate-700 font-medium max-w-[200px] truncate">
                {tenant.openingHoursText || 'Segunda a Domingo: 18:00 às 23:45'}
              </span>
              <Edit2 className="w-3 h-3 text-slate-400 group-hover:text-blue-600 ml-0.5 shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => setIsQrPairingModalOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200/80 rounded-lg text-xs cursor-pointer transition-colors shadow-2xs group"
              title="Clique para abrir o Pareamento com Evolution API via QR Code na tela"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  tenant.evolutionStatus === 'connected' ? 'bg-blue-500 ring-2 ring-blue-200' : 'bg-rose-500 ring-2 ring-rose-200 animate-pulse'
                }`}
              />
              <span className="text-slate-700 font-medium group-hover:text-slate-900">
                WhatsApp {tenant.evolutionStatus === 'connected' ? 'Conectado' : 'Desconectado'}
              </span>
              <QrCode className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-700 ml-0.5" />
            </button>

            <button
              type="button"
              onClick={() => {
                const publicUrl =
                  typeof window !== 'undefined'
                    ? `${window.location.origin}${window.location.pathname}?loja=${encodeURIComponent(tenant.slug)}`
                    : `https://aladay.com.br/?loja=${encodeURIComponent(tenant.slug)}`;
                navigator.clipboard?.writeText(publicUrl).catch(() => {});
                setPublicLinkCopied(true);
                setTimeout(() => setPublicLinkCopied(false), 3000);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                publicLinkCopied
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
              }`}
              title="Copiar link direto do cardápio digital para enviar aos clientes"
            >
              {publicLinkCopied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Link Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-500" />
                  <span>Copiar Link do Cardápio</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  const newUrl = `${window.location.pathname}?loja=${encodeURIComponent(tenant.slug)}`;
                  window.history.pushState({ loja: tenant.slug }, '', newUrl);
                }
                if (onOpenPublicMenu) {
                  onOpenPublicMenu();
                }
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="px-3.5 py-1.5 text-xs font-semibold text-white rounded-lg shadow-xs transition-opacity hover:opacity-90 flex items-center gap-1.5 cursor-pointer"
              style={{ backgroundColor: tenant.primaryColor }}
            >
              <span>Ver Cardápio Público</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Modal Rápido de Configuração de Horário do Cardápio na Barra Superior */}
      {isTopBarHoursModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Configurar Horário do Cardápio na Barra Superior
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Altere rapidamente o horário exibido no topo do cardápio digital e o status da loja
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsTopBarHoursModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const updatedTenant: RestaurantTenant = {
                  ...tenant,
                  openingHoursText: settingsHours.trim() || `${topBarDaysPreset}: ${topBarOpenTime} às ${topBarCloseTime}`,
                  isOpen: settingsIsOpen,
                };
                onUpdateTenant(updatedTenant);
                try {
                  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
                  if (authSession?.token) {
                    headers['Authorization'] = `Bearer ${authSession.token}`;
                  }
                  await fetch(`/api/v1/tenants/${encodeURIComponent(tenant.slug)}/settings`, {
                    method: 'PUT',
                    headers,
                    body: JSON.stringify({
                      name: updatedTenant.name,
                      phone: updatedTenant.phone,
                      address: updatedTenant.address,
                      primaryColor: updatedTenant.primaryColor,
                      isOpen: updatedTenant.isOpen,
                      openingHoursText: updatedTenant.openingHoursText,
                      deliveryFeeCents: updatedTenant.deliveryFeeCents,
                      minOrderCents: updatedTenant.minOrderCents,
                      deliveryZones: updatedTenant.deliveryZones,
                    }),
                  });
                } catch {
                  // state updated locally
                }
                triggerSyncNotice(
                  `Horário do cardápio atualizado na barra superior: "${updatedTenant.openingHoursText}" (${
                    updatedTenant.isOpen ? 'Aberto' : 'Fechado'
                  })!`
                );
                setIsTopBarHoursModalOpen(false);
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Status de Atendimento da Loja
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSettingsIsOpen(true)}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                      settingsIsOpen
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-800 shadow-2xs'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>Aberto (Recebendo Pedidos)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettingsIsOpen(false)}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                      !settingsIsOpen
                        ? 'bg-rose-50 border-rose-500 text-rose-800 shadow-2xs'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                    <span>Fechado</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Dias de Funcionamento
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'Segunda a Domingo',
                    'Terça a Domingo',
                    'Segunda a Sábado',
                    'Quarta a Domingo',
                    'Todos os dias',
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setTopBarDaysPreset(preset);
                        setSettingsHours(`${preset}: ${topBarOpenTime} às ${topBarCloseTime}`);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border cursor-pointer transition-colors ${
                        topBarDaysPreset === preset
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Horário de Abertura
                  </label>
                  <input
                    type="time"
                    value={topBarOpenTime}
                    onChange={(e) => {
                      const nextOpen = e.target.value;
                      setTopBarOpenTime(nextOpen);
                      setSettingsHours(`${topBarDaysPreset}: ${nextOpen} às ${topBarCloseTime}`);
                    }}
                    className="w-full p-2 text-xs font-mono border border-slate-300 rounded-xl text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Horário de Fechamento
                  </label>
                  <input
                    type="time"
                    value={topBarCloseTime}
                    onChange={(e) => {
                      const nextClose = e.target.value;
                      setTopBarCloseTime(nextClose);
                      setSettingsHours(`${topBarDaysPreset}: ${topBarOpenTime} às ${nextClose}`);
                    }}
                    className="w-full p-2 text-xs font-mono border border-slate-300 rounded-xl text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Texto Exibido na Barra Superior do Cardápio
                </label>
                <input
                  type="text"
                  required
                  value={settingsHours}
                  onChange={(e) => setSettingsHours(e.target.value)}
                  placeholder="Segunda a Domingo: 18:00 às 23:45"
                  className="w-full p-2.5 text-xs border border-slate-300 rounded-xl text-slate-900 font-medium"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsTopBarHoursModalOpen(false)}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Salvar Horário</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Real-time Synchronization Notice */}
      {liveSyncNotice && (
        <div className="bg-blue-600 text-white px-6 py-2.5 text-xs font-medium flex items-center justify-between shadow-xs transition-all">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-sky-200" />
            <span>{liveSyncNotice}</span>
          </div>
          <button
            onClick={() => setLiveSyncNotice(null)}
            className="text-white/80 hover:text-white p-1 rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Kitchen Mode Info Banner */}
      {!isSuperAdmin && userRole === 'kitchen' && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 text-xs text-amber-900 flex items-center justify-between gap-3 font-medium">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              <strong>Modo Operador de Cozinha (RBAC Ativo):</strong> Acesso restrito ao KDS e impressão de comandas. Relatórios financeiros, dados fiscais e credenciais da Evolution API estão bloqueados.
            </span>
          </div>
          <button
            onClick={() => setUserRole('owner')}
            className="text-amber-800 underline text-[11px] hover:text-amber-950 font-semibold shrink-0"
          >
            Alternar para Dono
          </button>
        </div>
      )}

      {/* Waiter Mode Info Banner */}
      {!isSuperAdmin && userRole === 'waiter' && (
        <div className="bg-blue-50 border-b border-blue-200 px-6 py-2.5 text-xs text-blue-950 flex items-center justify-between gap-3 font-medium">
          <div className="flex items-center gap-2">
            <Utensils className="w-4 h-4 text-blue-700 shrink-0" />
            <span>
              <strong>Modo Garçom &amp; Salão (RBAC Ativo):</strong> Foco rápido no Mapa de Mesas, lançamento de comandas direto para o KDS e fechamento de conta com divisão por pessoa e 10%.
            </span>
          </div>
          <button
            onClick={() => setUserRole('owner')}
            className="text-blue-800 underline text-[11px] hover:text-blue-950 font-semibold shrink-0"
          >
            Alternar para Dono
          </button>
        </div>
      )}

      {/* Tabs navigation */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 flex gap-4 sm:gap-6 text-xs font-medium overflow-x-auto">
        {isSuperAdmin ? (
          <>
            <button
              onClick={() => setActiveTab('super_subscriptions')}
              className={`py-3 border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'super_subscriptions'
                  ? 'border-indigo-600 text-indigo-600 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>Assinaturas &amp; Restaurantes</span>
              <span className="bg-indigo-50 text-indigo-700 text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold">
                {(allTenants.length > 0 ? allTenants : [tenant]).length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('reports')}
              className={`py-3 border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'reports'
                  ? 'border-indigo-600 text-indigo-600 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <BarChart3 className="w-4 h-4 shrink-0" />
              <span>Relatórios dos Restaurantes</span>
              <span className="bg-indigo-100 text-indigo-800 text-[9px] px-1.5 py-0.2 rounded font-semibold uppercase tracking-wider">
                {tenant.name}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`py-3 border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'settings'
                  ? 'border-indigo-600 text-indigo-600 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Settings className="w-4 h-4 shrink-0" />
              <span>Configurar Restaurante ({tenant.name})</span>
            </button>

            <button
              onClick={() => setActiveTab('whatsapp')}
              className={`py-3 border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'whatsapp'
                  ? 'border-indigo-600 text-indigo-600 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <MessageSquare className="w-4 h-4 shrink-0" />
              <span>Configurações da Aplicação (Evolution API, n8n &amp; Banco)</span>
            </button>

            <button
              onClick={() => setActiveTab('ifood')}
              className={`py-3 border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'ifood'
                  ? 'border-red-600 text-red-600 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Bike className="w-4 h-4 shrink-0 text-red-600" />
              <span>Integração iFood ({tenant.name})</span>
            </button>

            <button
              onClick={() => setActiveTab('billing')}
              className={`py-3 border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'billing'
                  ? 'border-indigo-600 text-indigo-600 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <CreditCard className="w-4 h-4 shrink-0" />
              <span>Faturamento &amp; Gateway Asaas</span>
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setActiveTab('menu')}
              className={`py-3 border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'menu' || activeTab === 'categories'
                  ? 'border-blue-600 text-blue-600 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Utensils className="w-4 h-4 shrink-0" />
              <span>Cardápio, Produtos &amp; Categorias</span>
              <span className="bg-blue-50 text-blue-700 text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold">
                {products.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('kds')}
              className={`py-3 border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 ${
                activeTab === 'kds'
                  ? 'border-blue-600 text-blue-600 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <LayoutGrid className="w-4 h-4 shrink-0" />
              <span>Gestão de Pedidos (KDS)</span>
              {ordersByStatus.received.length > 0 && (
                <span className="bg-blue-600 text-white text-[10px] px-1.5 py-0.2 rounded-full font-mono">
                  {ordersByStatus.received.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('tables')}
              className={`py-3 border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 ${
                activeTab === 'tables'
                  ? 'border-amber-600 text-amber-700 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Utensils className="w-4 h-4 shrink-0 text-amber-600" />
              <span>Mesas &amp; Garçom (Salão)</span>
              <span className="bg-amber-50 text-amber-800 border border-amber-200 text-[9px] px-1.5 py-0.2 rounded font-bold uppercase tracking-wider">
                PDV Mesa
              </span>
            </button>

            <button
              onClick={() => setActiveTab('ifood')}
              className={`py-3 border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 ${
                activeTab === 'ifood'
                  ? 'border-red-600 text-red-600 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Bike className="w-4 h-4 shrink-0 text-red-600" />
              <span>Integração iFood</span>
              <span className="bg-red-50 text-red-700 border border-red-200 text-[9px] px-1.5 py-0.2 rounded font-bold uppercase tracking-wider">
                Hub KDS
              </span>
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`py-3 border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 ${
                activeTab === 'settings'
                  ? 'border-blue-600 text-blue-600 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Settings className="w-4 h-4 shrink-0" />
              <span>Configurações &amp; Identidade</span>
            </button>

            <button
              onClick={() => setActiveTab('billing')}
              className={`py-3 border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 ${
                activeTab === 'billing'
                  ? 'border-blue-600 text-blue-600 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <CreditCard className="w-4 h-4 shrink-0" />
              <span>Assinatura (Anual R$ 99 / Mensal)</span>
            </button>

            <button
              onClick={() => setActiveTab('whatsapp')}
              className={`py-3 border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 ${
                activeTab === 'whatsapp'
                  ? 'border-blue-600 text-blue-600 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <MessageSquare className="w-4 h-4 shrink-0" />
              <span>WhatsApp &amp; Notificações</span>
            </button>

            <button
              onClick={() => setActiveTab('crm')}
              className={`py-3 border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 ${
                activeTab === 'crm'
                  ? 'border-blue-600 text-blue-600 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Users className="w-4 h-4 shrink-0" />
              <span>CRM &amp; Clientes</span>
              <span className="bg-slate-100 text-slate-700 text-[10px] px-1.5 py-0.5 rounded-full font-mono">
                {customers.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('reports')}
              className={`py-3 border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 ${
                activeTab === 'reports'
                  ? 'border-blue-600 text-blue-600 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <BarChart3 className="w-4 h-4 shrink-0" />
              <span>Relatórios</span>
              <span className="bg-blue-100 text-blue-800 text-[9px] px-1.5 py-0.2 rounded font-semibold uppercase tracking-wider">
                Vendas &amp; Produtos
              </span>
            </button>
          </>
        )}
      </div>

      {/* Main Content Body */}
      <div className="p-6 flex-1 overflow-y-auto">
        {/* ============================================================== */}
        {/* TAB 1: UNIFIED MENU, PRODUCTS & CATEGORIES CRUD                */}
        {/* ============================================================== */}
        {(activeTab === 'menu' || activeTab === 'categories') && (
          <div className="space-y-5">
            {/* Split Screen Container (if toggled) */}
            <div className={`grid gap-6 ${showLivePreviewSplit ? 'grid-cols-1 xl:grid-cols-12' : 'grid-cols-1'}`}>
              {/* Left Column: Product Management */}
              <div className={showLivePreviewSplit ? 'xl:col-span-7 space-y-4' : 'space-y-4'}>
                {/* Search & Actions Toolbar */}
                <div className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        placeholder="Buscar por prato ou ingrediente..."
                        value={productSearchQuery}
                        onChange={(e) => setProductSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:outline-blue-600"
                      />
                    </div>

                    <select
                      value={selectedCategoryFilter}
                      onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                      className="bg-slate-50 border border-slate-200 text-slate-800 text-xs rounded-lg px-2.5 py-1.5 font-medium"
                    >
                      <option value="all">Todas as Categorias ({products.length})</option>
                      {sortedCategories.map((c, idx) => (
                        <option key={c.id} value={c.id}>
                          {idx + 1}º - {c.name} ({products.filter((p) => p.categoryId === c.id).length})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowLivePreviewSplit(!showLivePreviewSplit)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                        showLivePreviewSplit
                          ? 'bg-slate-900 text-white'
                          : 'bg-blue-50 text-blue-900 hover:bg-blue-100 border border-blue-200'
                      }`}
                    >
                      <Smartphone className="w-3.5 h-3.5" />
                      <span>{showLivePreviewSplit ? 'Ocultar Prévia Mobile' : 'Prévia Mobile'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSpreadsheetModalTab('export')}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
                      title="Exportar categorias e produtos para planilha Excel / CSV ou baixar planilha modelo"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-blue-700" />
                      <span>Exportar Planilha</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsImportMenuModalOpen(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors"
                      title="Abrir modal de Importação de Cardápio com upload de arquivo e pré-visualização da tabela"
                    >
                      <Upload className="w-3.5 h-3.5 text-slate-600" />
                      <span>Importação de Cardápio</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsBulkAdjustOpen(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                      title="Aplicar aumento ou desconto percentual em massa"
                    >
                      <Percent className="w-3.5 h-3.5 text-slate-500" />
                      <span>Reajuste em Lote</span>
                    </button>

                    <button
                      onClick={() => handleOpenAddProduct()}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-xs"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Novo Produto</span>
                    </button>
                  </div>
                </div>

                {/* Category Filter Quick Pills */}
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                  <button
                    type="button"
                    onClick={() => setSelectedCategoryFilter('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors border ${
                      selectedCategoryFilter === 'all'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    Todas as Categorias ({sortedCategories.length})
                  </button>
                  {sortedCategories.map((cat, idx) => {
                    const count = products.filter((p) => p.categoryId === cat.id).length;
                    const isSelected = selectedCategoryFilter === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setSelectedCategoryFilter(cat.id)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors border ${
                          isSelected
                            ? 'bg-neutral-900 text-white border-neutral-900'
                            : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-300'
                        }`}
                      >
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-bold ${
                            isSelected ? 'bg-white/20 text-white' : 'bg-neutral-100 text-neutral-600'
                          }`}
                        >
                          {idx + 1}º
                        </span>
                        <span>{cat.name}</span>
                        <span
                          className={`text-[10px] font-mono ${
                            isSelected ? 'text-neutral-300' : 'text-neutral-400'
                          }`}
                        >
                          ({count})
                        </span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setIsCategoryModalOpen(true)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Nova Categoria</span>
                  </button>
                </div>

                {/* Organized Products Grouped by Category */}
                <div className="space-y-4">
                  {(selectedCategoryFilter === 'all'
                    ? sortedCategories
                    : sortedCategories.filter((c) => c.id === selectedCategoryFilter)
                  ).map((cat) => {
                    const catIndex = sortedCategories.findIndex((c) => c.id === cat.id);
                    const catProducts = filteredProducts.filter((p) => p.categoryId === cat.id);

                    if (productSearchQuery.trim() !== '' && catProducts.length === 0) {
                      return null;
                    }

                    return (
                      <div
                        key={cat.id}
                        className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-2xs"
                      >
                        {/* Category Section Header */}
                        <div className="px-4 py-3 bg-neutral-900 text-white flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <span className="w-6 h-6 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-mono text-xs font-bold flex items-center justify-center">
                              {catIndex + 1}º
                            </span>
                            {editingCategoryId === cat.id ? (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  value={editingCategoryName}
                                  onChange={(e) => setEditingCategoryName(e.target.value)}
                                  className="px-2 py-1 text-xs rounded bg-white text-neutral-900 font-bold outline-none"
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveCategoryRename(cat.id)}
                                  className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-bold"
                                >
                                  Salvar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingCategoryId(null)}
                                  className="px-2 py-1 bg-neutral-700 hover:bg-neutral-600 text-neutral-200 rounded text-[11px]"
                                >
                                  Cancelar
                                </button>
                              </div>
                            ) : (
                              <div>
                                <div className="flex items-center gap-2">
                                  <h4 className="text-xs sm:text-sm font-bold text-white">
                                    {cat.name}
                                  </h4>
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-neutral-800 text-neutral-300 border border-neutral-700">
                                    {catProducts.length} {catProducts.length === 1 ? 'item' : 'itens'}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={catIndex === 0}
                              onClick={() => handleMoveCategoryOrder(cat.id, 'up')}
                              className="p-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                              title="Subir posição desta categoria"
                            >
                              <ChevronUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={catIndex === sortedCategories.length - 1}
                              onClick={() => handleMoveCategoryOrder(cat.id, 'down')}
                              className="p-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                              title="Descer posição desta categoria"
                            >
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCategoryId(cat.id);
                                setEditingCategoryName(cat.name);
                              }}
                              className="p-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors cursor-pointer"
                              title="Renomear categoria"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            {sortedCategories.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleDeleteCategoryItem(cat)}
                                className="p-1.5 rounded bg-neutral-800 hover:bg-rose-600 text-neutral-300 hover:text-white transition-colors cursor-pointer"
                                title="Remover categoria"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleOpenAddProduct(cat.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition-colors ml-1 cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Adicionar Item</span>
                            </button>
                          </div>
                        </div>

                        {catProducts.length === 0 ? (
                          <div className="p-5 text-center text-xs text-neutral-500 flex flex-col sm:flex-row items-center justify-between gap-2 bg-neutral-50/50">
                            <span>Nenhum prato cadastrado na categoria <strong>{cat.name}</strong>.</span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleOpenAddProduct(cat.id)}
                                className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg text-[11px] font-semibold"
                              >
                                + Cadastrar 1º Prato em {cat.name}
                              </button>
                              {sortedCategories.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteCategoryItem(cat)}
                                  className="px-2.5 py-1.5 text-rose-600 hover:bg-rose-50 rounded-lg text-[11px] font-semibold"
                                >
                                  Remover Categoria Vazia
                                </button>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 font-semibold">
                                <tr>
                                  <th className="p-3 text-left">Foto / Nome do Produto</th>
                                  <th className="p-3 text-right">Preço</th>
                                  <th className="p-3 text-center">Status no Menu</th>
                                  <th className="p-3 text-right">Ações</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-neutral-200">
                                {catProducts.map((prod) => (
                                  <tr key={prod.id} className="hover:bg-neutral-50/60 transition-colors">
                                    <td className="p-3 flex items-center gap-3">
                                      {prod.imageUrl ? (
                                        <img
                                          src={prod.imageUrl}
                                          alt={prod.name}
                                          className="w-11 h-11 rounded-lg object-cover bg-neutral-100 shrink-0"
                                        />
                                      ) : (
                                        <div className="w-11 h-11 rounded-lg bg-neutral-100 flex items-center justify-center text-[10px] text-neutral-400 shrink-0">
                                          Sem foto
                                        </div>
                                      )}
                                      <div>
                                        <p className="font-bold text-neutral-900">{prod.name}</p>
                                        <p className="text-[11px] text-neutral-500 truncate max-w-xs">
                                          {prod.description}
                                        </p>
                                        {prod.optionGroups && prod.optionGroups.length > 0 && (
                                          <p className="text-[10px] text-emerald-700 font-medium mt-0.5">
                                            {prod.optionGroups.length} grupo(s) de adicionais
                                          </p>
                                        )}
                                      </div>
                                    </td>
                                    <td className="p-3 text-right font-mono font-bold text-neutral-900 tabular-nums">
                                      {formatBRL(prod.priceCents)}
                                    </td>
                                    <td className="p-3 text-center">
                                      <button
                                        onClick={() => handleToggleProductWithNotice(prod.id)}
                                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                                          prod.isAvailable
                                            ? 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                                            : 'bg-rose-50 text-rose-800 hover:bg-rose-100'
                                        }`}
                                        title="Clique para alternar disponibilidade imediata no cardápio do cliente"
                                      >
                                        <span
                                          className={`w-1.5 h-1.5 rounded-full ${
                                            prod.isAvailable ? 'bg-emerald-500' : 'bg-rose-500'
                                          }`}
                                        />
                                        {prod.isAvailable ? 'Disponível' : 'Pausado (Esgotado)'}
                                      </button>
                                    </td>
                                    <td className="p-3 text-right">
                                      <div className="flex items-center justify-end gap-1">
                                        <button
                                          onClick={() => handleOpenEditProduct(prod)}
                                          className="p-1.5 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded transition-colors"
                                          title="Editar Produto"
                                        >
                                          <Edit2 className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          onClick={() => handleDuplicateProduct(prod)}
                                          className="p-1.5 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded transition-colors"
                                          title="Duplicar Produto para criar variação rápida"
                                        >
                                          <Copy className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          onClick={() => {
                                            onDeleteProduct(prod.id);
                                            triggerSyncNotice(`Prato "${prod.name}" removido do cardápio.`);
                                          }}
                                          className="p-1.5 text-rose-600 hover:text-rose-900 hover:bg-rose-50 rounded transition-colors"
                                          title="Excluir Produto"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Unified Categories Overview & Order Card (Integrated into the same tab) */}
                <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-4 shadow-2xs">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-neutral-200">
                    <div>
                      <h3 className="text-sm font-bold text-neutral-900">Categorias do Cardápio</h3>
                      <p className="text-xs text-neutral-500">
                        Organize a ordem de exibição das categorias no cardápio digital ou crie novas categorias.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsImportMenuModalOpen(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-neutral-800 bg-neutral-100 hover:bg-neutral-200 border border-neutral-200 rounded-lg transition-colors cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5 text-neutral-600" />
                        <span>Importar Cardápio</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSpreadsheetModalTab('export')}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                        <span>Exportar (.CSV)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsCategoryModalOpen(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Nova Categoria</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    {sortedCategories.map((cat, idx) => {
                      const catProducts = products.filter((p) => p.categoryId === cat.id);
                      return (
                        <div
                          key={cat.id}
                          className="p-3.5 border border-neutral-200 rounded-xl flex flex-col gap-2 text-xs hover:border-neutral-300 transition-colors bg-neutral-50/40"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="w-6 h-6 rounded-lg bg-neutral-900 text-white font-mono text-[11px] font-bold flex items-center justify-center shrink-0">
                                {idx + 1}º
                              </span>
                              {editingCategoryId === cat.id ? (
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="text"
                                    value={editingCategoryName}
                                    onChange={(e) => setEditingCategoryName(e.target.value)}
                                    className="px-2 py-1 text-xs border border-neutral-300 rounded bg-white text-neutral-900 font-bold"
                                    autoFocus
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleSaveCategoryRename(cat.id)}
                                    className="px-2 py-1 bg-emerald-600 text-white rounded text-[11px] font-bold cursor-pointer"
                                  >
                                    Salvar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingCategoryId(null)}
                                    className="px-2 py-1 bg-neutral-200 text-neutral-700 rounded text-[11px] cursor-pointer"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              ) : (
                                <span className="font-bold text-neutral-900 break-words">{cat.name}</span>
                              )}
                            </div>

                            <div className="flex items-center gap-1 shrink-0 ml-auto">
                              <span className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-mono font-semibold mr-1">
                                {catProducts.length} {catProducts.length === 1 ? 'item' : 'itens'}
                              </span>
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => handleMoveCategoryOrder(cat.id, 'up')}
                                className="p-1 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-200/70 rounded disabled:opacity-30 cursor-pointer"
                                title="Subir posição"
                              >
                                <ChevronUp className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                disabled={idx === sortedCategories.length - 1}
                                onClick={() => handleMoveCategoryOrder(cat.id, 'down')}
                                className="p-1 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-200/70 rounded disabled:opacity-30 cursor-pointer"
                                title="Descer posição"
                              >
                                <ChevronDown className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingCategoryId(cat.id);
                                  setEditingCategoryName(cat.name);
                                }}
                                className="p-1 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-200/70 rounded cursor-pointer"
                                title="Renomear categoria"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              {sortedCategories.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteCategoryItem(cat)}
                                  className="p-1 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                                  title="Remover categoria"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          {catProducts.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1 border-t border-neutral-200/70">
                              {catProducts.map((p) => (
                                <span
                                  key={p.id}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-neutral-200 text-[10px] text-neutral-700"
                                >
                                  <span className="font-medium">{p.name}</span>
                                  <span className="font-mono text-neutral-400">{formatBRL(p.priceCents)}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Right Column: Split Live Phone Preview (when enabled) */}
              {showLivePreviewSplit && (
                <div className="xl:col-span-5 bg-neutral-900 rounded-2xl p-4 shadow-xl border border-neutral-800 flex flex-col items-center">
                  <div className="w-full flex items-center justify-between pb-3 border-b border-neutral-800 text-xs text-neutral-400 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-white font-semibold">Sincronização em Tempo Real</span>
                    </div>
                    <span className="font-mono text-[11px] text-neutral-400">Cardápio do Cliente</span>
                  </div>

                  <p className="text-[11px] text-neutral-400 text-center mb-3">
                    Pausar ou editar itens à esquerda reflete <strong>imediatamente</strong> aqui no celular do cliente:
                  </p>

                  <div className="w-full max-w-[360px] bg-white rounded-xl shadow-2xs overflow-hidden border border-neutral-700 max-h-[620px] overflow-y-auto">
                    <ConsumerMenuView
                      tenant={tenant}
                      categories={categories}
                      products={products}
                      onUpdateTenant={onUpdateTenant}
                      canConfigureSchedule={true}
                      onOrderCreated={() => {
                        triggerSyncNotice('Pedido de teste recebido pelo cardápio sincronizado!');
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Bulk Price Adjustment Modal */}
            {isBulkAdjustOpen && (
              <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
                <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl border border-neutral-200 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-neutral-200">
                    <div className="flex items-center gap-2">
                      <Percent className="w-5 h-5 text-orange-600" />
                      <h3 className="text-sm font-bold text-neutral-900">Reajuste de Preços em Lote</h3>
                    </div>
                    <button
                      onClick={() => setIsBulkAdjustOpen(false)}
                      className="text-neutral-400 hover:text-neutral-700"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <p className="text-xs text-neutral-600 leading-relaxed">
                    Aplique reajustes percentuais para cobrir inflação de insumos ou crie descontos temporários para promoções.
                  </p>

                  <div className="space-y-3 text-xs">
                    <div>
                      <label className="block font-medium text-neutral-700 mb-1">
                        Percentual de Ajuste (%):
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="1"
                          value={bulkPercent}
                          onChange={(e) => setBulkPercent(e.target.value)}
                          placeholder="Ex: 5 para +5%, -10 para desconto de 10%"
                          className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs"
                        />
                        <span className="text-neutral-500 font-bold">%</span>
                      </div>
                      <p className="text-[11px] text-neutral-400 mt-1">
                        Use valores positivos para aumento (+5%) ou negativos para desconto (-10%).
                      </p>
                    </div>

                    <div>
                      <label className="block font-medium text-neutral-700 mb-1">
                        Aplicar em qual categoria?
                      </label>
                      <select
                        value={bulkCategory}
                        onChange={(e) => setBulkCategory(e.target.value)}
                        className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs"
                      >
                        <option value="all">Todas as Categorias do Cardápio</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            Apenas {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200 text-xs">
                    <button
                      type="button"
                      onClick={() => setIsBulkAdjustOpen(false)}
                      className="px-3.5 py-2 text-neutral-700 hover:bg-neutral-100 rounded-lg font-medium"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyBulkPriceAdjustment}
                      className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white font-semibold rounded-lg shadow-xs"
                    >
                      Aplicar Reajuste
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 3: SETTINGS & BRAND IDENTITY                               */}
        {/* ============================================================== */}
        {activeTab === 'settings' && (
          <div className="space-y-5">
            {isSuperAdmin && (
              <div className="bg-indigo-950 text-white border border-indigo-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-indigo-300">
                    <ShieldCheck className="w-4 h-4 text-indigo-400" />
                    <span>MODO SUPER ADMIN · CONFIGURAÇÃO DIRETA DO RESTAURANTE</span>
                  </div>
                  <p className="text-xs text-slate-300">
                    Você está editando as configurações de <strong>{tenant.name}</strong> (<code className="text-indigo-200">{tenant.slug}</code>). Qualquer alteração abaixo é aplicada imediatamente ao restaurante selecionado.
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={tenant.slug}
                    onChange={(e) => {
                      const found = (allTenants.length > 0 ? allTenants : [tenant]).find((t) => t.slug === e.target.value);
                      if (found && onSelectTenant) onSelectTenant(found);
                    }}
                    className="bg-slate-900 border border-indigo-700 text-white text-xs rounded-lg px-3 py-1.5 font-semibold"
                  >
                    {(allTenants.length > 0 ? allTenants : [tenant]).map((t) => (
                      <option key={t.slug} value={t.slug}>
                        Trocar: {t.name} ({t.slug})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setActiveTab('super_subscriptions')}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    Ver Todos
                  </button>
                </div>
              </div>
            )}

          <div className="max-w-3xl bg-white border border-neutral-200 rounded-lg p-6 space-y-6">
            <div>
              <h3 className="text-sm font-bold text-neutral-900">
                {isSuperAdmin ? `Configurações do Restaurante: ${tenant.name}` : 'Configurações Gerais do Restaurante'}
              </h3>
              <p className="text-xs text-neutral-500">
                Altere dados cadastrais, horários de atendimento, taxa de entrega padrão, chave Pix e a cor da marca.
              </p>
            </div>

            {settingsSuccessNotice && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 font-medium flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{settingsSuccessNotice}</span>
              </div>
            )}

            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">Nome Fantasia do Estabelecimento</label>
                  <input
                    type="text"
                    required
                    value={settingsName}
                    onChange={(e) => setSettingsName(e.target.value)}
                    className="w-full p-2.5 text-xs border border-neutral-200 rounded-lg text-neutral-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">WhatsApp da Loja (com DDD)</label>
                  <input
                    type="tel"
                    required
                    value={settingsPhone}
                    onChange={(e) => setSettingsPhone(e.target.value)}
                    className="w-full p-2.5 text-xs border border-neutral-200 rounded-lg text-neutral-900 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">Endereço Completo</label>
                <input
                  type="text"
                  required
                  value={settingsAddress}
                  onChange={(e) => setSettingsAddress(e.target.value)}
                  className="w-full p-2.5 text-xs border border-neutral-200 rounded-lg text-neutral-900"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">Taxa de Entrega Padrão (R$)</label>
                  <input
                    type="text"
                    required
                    value={settingsDeliveryFee}
                    onChange={(e) => setSettingsDeliveryFee(e.target.value)}
                    placeholder="8.00"
                    className="w-full p-2.5 text-xs border border-neutral-200 rounded-lg text-neutral-900 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">Pedido Mínimo (R$)</label>
                  <input
                    type="text"
                    required
                    value={settingsMinOrder}
                    onChange={(e) => setSettingsMinOrder(e.target.value)}
                    placeholder="25.00"
                    className="w-full p-2.5 text-xs border border-neutral-200 rounded-lg text-neutral-900 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">Cor Primária da Marca</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={settingsPrimaryColor}
                      onChange={(e) => setSettingsPrimaryColor(e.target.value)}
                      className="w-10 h-9 p-0.5 border border-neutral-200 rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      value={settingsPrimaryColor}
                      onChange={(e) => setSettingsPrimaryColor(e.target.value)}
                      className="flex-1 p-2 text-xs border border-neutral-200 rounded-lg font-mono text-neutral-900"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">Horário de Funcionamento Visível</label>
                <input
                  type="text"
                  required
                  value={settingsHours}
                  onChange={(e) => setSettingsHours(e.target.value)}
                  placeholder="Terça a Domingo: 18:00 às 23:30"
                  className="w-full p-2.5 text-xs border border-neutral-200 rounded-lg text-neutral-900"
                />
              </div>

              {/* Direct Pix Credentials Section inside Settings Form */}
              <div className="pt-4 border-t border-neutral-200 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-neutral-900 flex items-center gap-1.5">
                      <QrCode className="w-4 h-4 text-emerald-600" />
                      <span>Dados de Recebimento Pix Direto do Restaurante (Checkout do Consumidor)</span>
                    </h4>
                    <p className="text-[11px] text-neutral-500 mt-0.5">
                      Defina a <strong>Chave Pix</strong> e o <strong>Nome do Beneficiário</strong> deste restaurante. O QR Code Pix dinâmico gerado no checkout do consumidor utiliza essas chaves para que 100% do pagamento caia diretamente na conta do proprietário.
                    </p>
                  </div>
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 shrink-0">
                    100% Direto na Conta do Proprietário
                  </span>
                </div>

                <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-xl grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="md:col-span-3">
                    <label className="block text-xs font-semibold text-neutral-800 mb-1">
                      Tipo de Chave Pix
                    </label>
                    <select
                      value={pixKeyType}
                      onChange={(e) => setPixKeyType(e.target.value as PixGatewayConfig['pixKeyType'])}
                      className="w-full p-2.5 text-xs border border-neutral-300 rounded-lg bg-white text-neutral-900 font-medium focus:border-emerald-600 outline-none"
                    >
                      <option value="cnpj">CNPJ</option>
                      <option value="cpf">CPF</option>
                      <option value="email">E-mail</option>
                      <option value="phone">Celular / Telefone</option>
                      <option value="random">Chave Aleatória (EVP)</option>
                    </select>
                  </div>

                  <div className="md:col-span-5">
                    <label className="block text-xs font-semibold text-neutral-800 mb-1">
                      Chave Pix
                    </label>
                    <input
                      type="text"
                      required
                      value={pixKey}
                      onChange={(e) => setPixKey(e.target.value)}
                      placeholder="Ex: 12.345.678/0001-90, email@loja.com ou +5511999999999"
                      className="w-full p-2.5 text-xs border border-neutral-300 rounded-lg bg-white text-neutral-900 font-mono focus:border-emerald-600 outline-none"
                    />
                  </div>

                  <div className="md:col-span-4">
                    <label className="block text-xs font-semibold text-neutral-800 mb-1">
                      Nome do Beneficiário
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={60}
                      value={pixMerchantName}
                      onChange={(e) => setPixMerchantName(e.target.value)}
                      placeholder="Nome do Proprietário ou Razão Social"
                      className="w-full p-2.5 text-xs border border-neutral-300 rounded-lg bg-white text-neutral-900 font-medium focus:border-emerald-600 outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Delivery Zones by Neighborhood Section */}
              <div className="pt-4 border-t border-neutral-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-neutral-900 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-neutral-700" />
                      <span>Taxas de Entrega Dinâmicas por Bairro / Região</span>
                    </h4>
                    <p className="text-[11px] text-neutral-500 mt-0.5">
                      Configure os bairros atendidos com taxas personalizadas. O cliente poderá selecionar o bairro no cardápio e a automação do WhatsApp informará a taxa exata.
                    </p>
                  </div>
                  <span className="text-[11px] font-mono text-neutral-500 font-semibold">
                    {deliveryZones.filter((z) => z.active).length} ativas de {deliveryZones.length}
                  </span>
                </div>

                {/* Zones List */}
                <div className="border border-neutral-200 rounded-lg overflow-hidden divide-y divide-neutral-200 text-xs">
                  {deliveryZones.map((zone) => (
                    <div
                      key={zone.id}
                      className={`p-3 flex items-center justify-between gap-3 transition-colors ${
                        zone.active ? 'bg-white' : 'bg-neutral-50 opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={zone.active}
                          onChange={() => handleToggleDeliveryZone(zone.id)}
                          className="w-4 h-4 rounded text-neutral-900 accent-neutral-900 cursor-pointer"
                          title={zone.active ? 'Desativar região' : 'Ativar região'}
                        />
                        <div>
                          <p className={`font-semibold ${zone.active ? 'text-neutral-900' : 'text-neutral-500 line-through'}`}>
                            {zone.name}
                          </p>
                          <p className="text-[10px] text-neutral-400 font-mono">
                            Tempo estimado: ~{zone.estimatedMinutes} min
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="font-mono font-bold text-neutral-900 text-xs">
                          {formatBRL(zone.feeCents)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveDeliveryZone(zone.id)}
                          className="p-1 text-neutral-400 hover:text-rose-600 rounded"
                          title="Remover região"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {deliveryZones.length === 0 && (
                    <div className="p-4 text-center text-neutral-400 text-[11px]">
                      Nenhuma zona cadastrada. Use o formulário abaixo para adicionar bairros.
                    </div>
                  )}
                </div>

                {/* Add New Zone Bar */}
                <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg space-y-2">
                  <span className="text-[11px] font-bold text-neutral-800">
                    + Cadastrar Novo Bairro / Região de Entrega:
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <div className="sm:col-span-5">
                      <input
                        type="text"
                        placeholder="Nome do Bairro (Ex: Moema, Pinheiros)"
                        value={newZoneName}
                        onChange={(e) => setNewZoneName(e.target.value)}
                        className="w-full p-2 text-xs border border-neutral-300 rounded bg-white text-neutral-900"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <input
                        type="text"
                        placeholder="Taxa R$ (8.00)"
                        value={newZoneFee}
                        onChange={(e) => setNewZoneFee(e.target.value)}
                        className="w-full p-2 text-xs border border-neutral-300 rounded bg-white text-neutral-900 font-mono"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <input
                        type="number"
                        placeholder="Min (40)"
                        value={newZoneMinutes}
                        onChange={(e) => setNewZoneMinutes(e.target.value)}
                        className="w-full p-2 text-xs border border-neutral-300 rounded bg-white text-neutral-900 font-mono"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <button
                        type="button"
                        onClick={handleAddDeliveryZone}
                        className="w-full p-2 bg-neutral-800 hover:bg-neutral-900 text-white rounded text-xs font-semibold"
                      >
                        Adicionar
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between border-t border-neutral-200">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-neutral-800">
                  <input
                    type="checkbox"
                    checked={settingsIsOpen}
                    onChange={(e) => setSettingsIsOpen(e.target.checked)}
                    className="w-4 h-4 rounded text-neutral-900 accent-neutral-900"
                  />
                  <span>Estabelecimento Aberto para Receber Pedidos Agora</span>
                </label>

                <button
                  type="submit"
                  className="py-2.5 px-5 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors shadow-xs"
                >
                  Salvar Alterações
                </button>
              </div>
            </form>

            {isSuperAdmin && (
              <div className="pt-4 border-t border-slate-200 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-indigo-600" />
                      <span>Parâmetros Técnicos &amp; Assinatura do Restaurante (Exclusivo Super Admin)</span>
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Configure diretamente a instância Evolution API, status da assinatura e webhook n8n deste restaurante.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-indigo-50/50 border border-indigo-200 rounded-xl p-4 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Status da Assinatura</label>
                    <select
                      value={tenant.subscriptionStatus || 'active'}
                      onChange={(e) => {
                        const nextStatus = e.target.value as 'active' | 'trial' | 'past_due' | 'suspended';
                        onUpdateTenant({
                          ...tenant,
                          subscriptionStatus: nextStatus,
                          trialEndsAt:
                            nextStatus === 'trial'
                              ? new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString()
                              : tenant.trialEndsAt,
                        });
                        setSettingsSuccessNotice(`Status da assinatura de ${tenant.name} atualizado para "${nextStatus}"!`);
                        setTimeout(() => setSettingsSuccessNotice(null), 4000);
                      }}
                      className="w-full p-2 border border-slate-300 rounded-lg bg-white text-slate-900 font-semibold"
                    >
                      <option value="active">Ativa (Liberada)</option>
                      <option value="trial">Teste Grátis (15 Dias)</option>
                      <option value="past_due">Inadimplente / Vencida</option>
                      <option value="suspended">Suspensa / Bloqueada</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Instância Evolution API</label>
                    <input
                      type="text"
                      value={tenant.evolutionInstanceId || ''}
                      onChange={(e) =>
                        onUpdateTenant({
                          ...tenant,
                          evolutionInstanceId: e.target.value,
                        })
                      }
                      placeholder="Ex: aladay"
                      className="w-full p-2 border border-slate-300 rounded-lg bg-white text-slate-900 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Status WhatsApp</label>
                    <select
                      value={tenant.evolutionStatus || 'disconnected'}
                      onChange={(e) =>
                        onUpdateTenant({
                          ...tenant,
                          evolutionStatus: e.target.value as 'connected' | 'connecting' | 'disconnected',
                        })
                      }
                      className="w-full p-2 border border-slate-300 rounded-lg bg-white text-slate-900 font-semibold"
                    >
                      <option value="connected">Conectado</option>
                      <option value="connecting">Conectando</option>
                      <option value="disconnected">Desconectado</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 4: KDS KANBAN (Esteira de Pedidos)                          */}
        {/* ============================================================== */}
        {activeTab === 'kds' && (
          <div className="space-y-4">
            {/* Status Update Live Toast */}
            {statusUpdateToast && (
              <div className="bg-emerald-950 text-white p-3.5 rounded-xl border border-emerald-700 shadow-md flex items-center justify-between text-xs animate-in fade-in">
                <div className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                  <span className="font-medium">{statusUpdateToast}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setStatusUpdateToast(null)}
                  className="text-emerald-300 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Explanatory Header & SLA Color Legend */}
            <div className="bg-white border border-neutral-200 rounded-xl p-4 space-y-3 shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                    <LayoutGrid className="w-4 h-4 text-orange-600" />
                    <span>Quadro KDS em Tempo Real com Contador de Tempo &amp; Notificação WhatsApp</span>
                  </h3>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {isSuperAdmin ? (
                      <>
                        Ao avançar o status no Kanban, o sistema dispara automaticamente uma mensagem formatada para o WhatsApp do cliente via Evolution API (instância <code className="font-mono text-neutral-800 font-bold">{tenant.evolutionInstanceId || 'aladay'}</code>).
                      </>
                    ) : (
                      'Ao avançar o status do pedido, o cliente recebe automaticamente uma notificação no WhatsApp.'
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {isSuperAdmin && (
                    <button
                      type="button"
                      onClick={handleQuickSimulateIfoodOrderInKds}
                      className="text-xs font-bold text-white bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                      title="Injetar um pedido iFood de teste imediatamente no KDS"
                    >
                      <Bike className="w-3.5 h-3.5" />
                      <span>+ Simular Pedido iFood</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setActiveTab('whatsapp')}
                    className="text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors"
                    title="Configurar e testar textos das mensagens de notificação"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Ajustar Textos WhatsApp</span>
                  </button>
                  <span className="text-xs text-neutral-500 font-mono bg-neutral-100 px-2.5 py-1.5 rounded-lg">
                    {orders.length} pedidos hoje
                  </span>
                </div>
              </div>

              {/* SLA Visual Timer Legend */}
              <div className="pt-2.5 border-t border-neutral-100 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <span className="font-semibold text-neutral-600 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-neutral-500" />
                  <span>Indicador Visual de Tempo de Espera (SLA por Pedido):</span>
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-300 text-emerald-900 font-semibold">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>0–10 min (No Prazo)</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 border border-amber-300 text-amber-900 font-semibold">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <span>10–20 min (Atenção)</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-50 border border-rose-300 text-rose-900 font-semibold">
                    <span className="w-2 h-2 rounded-full bg-rose-600 animate-ping" />
                    <span>20+ min (Crítico)</span>
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Recebidos */}
              <div className="bg-white border border-neutral-200 rounded-xl p-3 flex flex-col h-[540px] shadow-2xs">
                <div className="flex items-center justify-between pb-2 border-b border-neutral-200 mb-3">
                  <span className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    Recebidos ({ordersByStatus.received.length})
                  </span>
                  <span className="text-[10px] text-neutral-400 font-mono">Aguardando</span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                  {ordersByStatus.received.map((order) => {
                    const timer = getOrderKdsTimerVisuals(order);
                    return (
                      <div
                        key={order.id}
                        className={`border rounded-xl p-3 space-y-2 shadow-2xs transition-colors ${timer.cardBgClass}`}
                      >
                        <div className="flex justify-between items-start gap-1.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-mono font-bold text-neutral-900">
                              #{order.ifoodDisplayId || order.orderNumber}
                            </span>
                            {order.channel === 'IFOOD' ? (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider bg-red-600 text-white shadow-2xs">
                                iFood
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-800">
                                Direto 0%
                              </span>
                            )}
                            {order.ifoodPickupCode && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-red-50 text-red-800 border border-red-200">
                                Coleta: {order.ifoodPickupCode}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border shadow-2xs ${timer.badgeClass}`}
                              title={`Recebido às ${order.createdAt} (${timer.label})`}
                            >
                              <Clock className="w-2.5 h-2.5 shrink-0" />
                              <span>{timer.label}</span>
                            </span>
                            <span className="text-[10px] text-neutral-500 font-mono">{order.createdAt}</span>
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-xs font-bold text-neutral-900">{order.customerName}</p>
                            {order.tableNumber && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                🍽️ MESA {order.tableNumber}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-neutral-600 font-mono">+{order.customerPhone}</p>
                          <p className="text-[11px] text-neutral-600 mt-0.5">
                            {order.type === 'dine_in'
                              ? `🍽️ Salão (Mesa ${order.tableNumber || '01'})${order.waiterName ? ` · Garçom: ${order.waiterName}` : ''}`
                              : order.type === 'delivery'
                              ? '🛵 Entrega'
                              : '🛍️ Retirada'}{' '}
                            · {order.items.length} itens
                          </p>
                        </div>

                        <div className="flex justify-between items-center text-xs font-mono font-bold text-neutral-900 pt-1">
                          <span>{formatBRL(order.totalCents)}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex items-center gap-1 ${
                            order.paymentStatus === 'paid_online'
                              ? 'bg-emerald-100 text-emerald-800 font-bold border border-emerald-200'
                              : 'bg-white/80 text-neutral-800 border border-neutral-200'
                          }`}>
                            {order.paymentStatus === 'paid_online' && <Zap className="w-2.5 h-2.5 text-emerald-600 fill-current" />}
                            {order.paymentStatus === 'paid_online' ? '⚡ Pix Pago Online' : order.paymentMethod}
                          </span>
                        </div>

                        {/* Card Action Buttons */}
                        <div className={`pt-2 border-t ${timer.dividerClass} flex flex-col gap-1.5`}>
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleKdsStatusChange(order, 'confirmed')}
                              className="flex-1 py-1.5 px-2 text-[11px] font-bold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors flex items-center justify-center gap-1 shadow-xs"
                            >
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span>Confirmar Pedido</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleKdsStatusChange(order, 'cancelled')}
                              className="py-1.5 px-2 text-[11px] font-semibold text-rose-700 bg-rose-100 hover:bg-rose-200 rounded-lg transition-colors"
                              title="Recusar pedido"
                            >
                              Recusar
                            </button>
                          </div>

                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => setTrackingOrderModal(order)}
                              className="flex-1 py-1 px-1.5 text-[10px] font-medium text-neutral-700 bg-white border border-neutral-300 hover:bg-neutral-50 rounded flex items-center justify-center gap-1"
                            >
                              <Clock className="w-3 h-3 text-amber-600" />
                              <span>Rastrear (Cliente)</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setPrintingOrder(order)}
                              className="p-1 text-neutral-600 bg-white border border-neutral-300 hover:bg-neutral-50 rounded"
                              title="Imprimir comanda térmica"
                            >
                              <Printer className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {ordersByStatus.received.length === 0 && (
                    <p className="text-xs text-neutral-400 text-center pt-10">Nenhum pedido pendente.</p>
                  )}
                </div>
              </div>

              {/* Em Preparo */}
              <div className="bg-white border border-neutral-200 rounded-xl p-3 flex flex-col h-[540px] shadow-2xs">
                <div className="flex items-center justify-between pb-2 border-b border-neutral-200 mb-3">
                  <span className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                    Em Preparo ({ordersByStatus.confirmed.length + ordersByStatus.preparing.length})
                  </span>
                  <span className="text-[10px] text-neutral-400 font-mono">Cozinha</span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                  {[...ordersByStatus.confirmed, ...ordersByStatus.preparing].map((order) => {
                    const timer = getOrderKdsTimerVisuals(order);
                    return (
                      <div
                        key={order.id}
                        className={`border rounded-xl p-3 space-y-2 shadow-2xs transition-colors ${timer.cardBgClass}`}
                      >
                        <div className="flex justify-between items-start gap-1.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-mono font-bold text-neutral-900">
                              #{order.ifoodDisplayId || order.orderNumber}
                            </span>
                            {order.channel === 'IFOOD' && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider bg-red-600 text-white">
                                iFood
                              </span>
                            )}
                            {order.ifoodPickupCode && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-red-50 text-red-800 border border-red-200">
                                Coleta: {order.ifoodPickupCode}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border shadow-2xs ${timer.badgeClass}`}
                              title={`Recebido às ${order.createdAt} (${timer.label})`}
                            >
                              <Clock className="w-2.5 h-2.5 shrink-0" />
                              <span>{timer.label}</span>
                            </span>
                            <span className="text-[10px] text-neutral-500 font-mono">{order.createdAt}</span>
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-xs font-bold text-neutral-900">{order.customerName}</p>
                            {order.tableNumber && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                🍽️ MESA {order.tableNumber}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-neutral-700 mt-1 space-y-0.5">
                            {order.items.map((i, idx) => (
                              <p key={idx} className="truncate">
                                • {i.quantity}x {i.productName}
                              </p>
                            ))}
                          </div>
                        </div>

                        <div className={`pt-2 border-t ${timer.dividerClass} flex flex-col gap-1.5`}>
                          <button
                            type="button"
                            onClick={() => handleKdsStatusChange(order, 'ready')}
                            className="w-full py-1.5 px-2 text-[11px] font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center justify-center gap-1 shadow-xs"
                          >
                            <Bike className="w-3 h-3" />
                            <span>Pronto / Despachar</span>
                          </button>

                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => setTrackingOrderModal(order)}
                              className="flex-1 py-1 px-1.5 text-[10px] font-medium text-neutral-700 bg-white hover:bg-neutral-50 rounded flex items-center justify-center gap-1 border border-neutral-200"
                            >
                              <Clock className="w-3 h-3 text-blue-600" />
                              <span>Rastrear (Cliente)</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setPrintingOrder(order)}
                              className="p-1 text-neutral-600 bg-white hover:bg-neutral-50 rounded border border-neutral-200"
                              title="Imprimir comanda térmica"
                            >
                              <Printer className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {ordersByStatus.confirmed.length + ordersByStatus.preparing.length === 0 && (
                    <p className="text-xs text-neutral-400 text-center pt-10">Cozinha liberada.</p>
                  )}
                </div>
              </div>

              {/* Prontos */}
              <div className="bg-white border border-neutral-200 rounded-xl p-3 flex flex-col h-[540px] shadow-2xs">
                <div className="flex items-center justify-between pb-2 border-b border-neutral-200 mb-3">
                  <span className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                    A Caminho / Pronto ({ordersByStatus.ready.length})
                  </span>
                  <span className="text-[10px] text-neutral-400 font-mono">Expedição</span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                  {ordersByStatus.ready.map((order) => {
                    const timer = getOrderKdsTimerVisuals(order);
                    return (
                      <div
                        key={order.id}
                        className={`border rounded-xl p-3 space-y-2 shadow-2xs transition-colors ${timer.cardBgClass}`}
                      >
                        <div className="flex justify-between items-start gap-1.5">
                          <span className="text-xs font-mono font-bold text-neutral-900">
                            #{order.orderNumber}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border shadow-2xs ${timer.badgeClass}`}
                              title={`Recebido às ${order.createdAt} (${timer.label})`}
                            >
                              <Clock className="w-2.5 h-2.5 shrink-0" />
                              <span>{timer.label}</span>
                            </span>
                            <span className="text-[10px] text-neutral-500 font-mono">{order.createdAt}</span>
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-xs font-bold text-neutral-900">{order.customerName}</p>
                            {order.tableNumber && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                🍽️ MESA {order.tableNumber}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-neutral-700">
                            {order.type === 'dine_in'
                              ? `🍽️ Servir na Mesa ${order.tableNumber || '01'}${order.waiterName ? ` (${order.waiterName})` : ''}`
                              : order.type === 'delivery'
                              ? `🛵 ${order.deliveryAddress || 'Entrega'}`
                              : '🛍️ Retirada no balcão'}
                          </p>
                        </div>

                        <div className={`pt-2 border-t ${timer.dividerClass} flex flex-col gap-1.5`}>
                          <button
                            type="button"
                            onClick={() => handleKdsStatusChange(order, 'delivered')}
                            className="w-full py-1.5 px-2 text-[11px] font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors flex items-center justify-center gap-1 shadow-xs"
                          >
                            <PackageCheck className="w-3.5 h-3.5" />
                            <span>Concluir e Entregar</span>
                          </button>

                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => setTrackingOrderModal(order)}
                              className="flex-1 py-1 px-1.5 text-[10px] font-medium text-neutral-700 bg-white hover:bg-neutral-50 rounded flex items-center justify-center gap-1 border border-neutral-200"
                            >
                              <Clock className="w-3 h-3 text-purple-600" />
                              <span>Rastrear (Cliente)</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setPrintingOrder(order)}
                              className="p-1 text-neutral-600 bg-white hover:bg-neutral-50 rounded border border-neutral-200"
                              title="Imprimir comanda térmica"
                            >
                              <Printer className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {ordersByStatus.ready.length === 0 && (
                    <p className="text-xs text-neutral-400 text-center pt-10">Nenhum pedido aguardando saída.</p>
                  )}
                </div>
              </div>

              {/* Concluídos */}
              <div className="bg-white border border-neutral-200 rounded-xl p-3 flex flex-col h-[540px] shadow-2xs">
                <div className="flex items-center justify-between pb-2 border-b border-neutral-200 mb-3">
                  <span className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    Concluídos ({ordersByStatus.delivered.length})
                  </span>
                  <span className="text-[10px] text-neutral-400 font-mono">Finalizados</span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {ordersByStatus.delivered.map((order) => {
                    const timer = getOrderKdsTimerVisuals(order);
                    return (
                      <div
                        key={order.id}
                        className={`border rounded-xl p-2.5 text-xs text-neutral-700 space-y-1.5 transition-colors ${timer.cardBgClass}`}
                      >
                        <div className="flex justify-between items-center font-mono gap-1">
                          <span className="font-bold text-neutral-900">#{order.orderNumber}</span>
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${timer.badgeClass}`}
                            title={`Recebido às ${order.createdAt} (${timer.label})`}
                          >
                            <Clock className="w-2.5 h-2.5 shrink-0" />
                            <span>{timer.label}</span>
                          </span>
                          <span className="tabular-nums font-semibold text-neutral-900">{formatBRL(order.totalCents)}</span>
                        </div>
                        <p className="text-[11px] truncate font-medium text-neutral-800">{order.customerName}</p>

                        <div className={`flex gap-1 pt-1 border-t ${timer.dividerClass}`}>
                          <button
                            type="button"
                            onClick={() => setTrackingOrderModal(order)}
                            className="flex-1 py-1 px-1.5 text-[10px] font-medium text-neutral-700 bg-white hover:bg-neutral-100 rounded flex items-center justify-center gap-1 border border-neutral-200"
                          >
                            <Clock className="w-3 h-3 text-emerald-600" />
                            <span>Ver Rastreio</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setPrintingOrder(order)}
                            className="p-1 text-neutral-600 bg-white hover:bg-neutral-100 rounded border border-neutral-200"
                            title="Reimprimir comanda"
                          >
                            <Printer className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {ordersByStatus.delivered.length === 0 && (
                    <p className="text-xs text-neutral-400 text-center pt-10">Nenhum pedido finalizado ainda.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB SUPER ADMIN: ACOMPANHAMENTO DE ASSINATURAS & RESTAURANTES  */}
        {/* ============================================================== */}
        {activeTab === 'super_subscriptions' && isSuperAdmin && (
          <div className="space-y-6">
            {superAdminActionNotice && (
              <div className="p-3.5 bg-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-900 font-semibold flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>{superAdminActionNotice}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSuperAdminActionNotice(null)}
                  className="text-indigo-500 hover:text-indigo-800"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Global SaaS KPIs */}
            {(() => {
              const tenantsToInspect = allTenants.length > 0 ? allTenants : [tenant];
              const activeCount = tenantsToInspect.filter(
                (t) =>
                  t.subscriptionStatus === 'active' ||
                  t.asaasSubscription?.status === 'ACTIVE' ||
                  (!t.subscriptionStatus && !t.trialEndsAt)
              ).length;
              const trialCount = tenantsToInspect.filter((t) => t.subscriptionStatus === 'trial').length;
              const overdueCount = tenantsToInspect.filter(
                (t) => t.subscriptionStatus === 'past_due' || t.subscriptionStatus === 'suspended'
              ).length;
              const estimatedMrrCents = activeCount * 12990;

              const totalPlatformOrders = tenantsToInspect.reduce((acc, t) => {
                const cat = catalogsByTenant[t.slug];
                return acc + (cat ? cat.orderIds.length : t.slug === tenant.slug ? orders.length : 0);
              }, 0);

              const totalPlatformGmvCents = tenantsToInspect.reduce((acc, t) => {
                const cat = catalogsByTenant[t.slug];
                if (cat) {
                  return (
                    acc +
                    cat.orderIds.reduce((sum, id) => {
                      const ord = cat.ordersById[id];
                      return ord && ord.status !== 'cancelled' ? sum + (ord.totalCents || 0) : sum;
                    }, 0)
                  );
                }
                return acc;
              }, 0);

              const filteredTenants = tenantsToInspect.filter((t) => {
                const q = superAdminSearch.trim().toLowerCase();
                const matchesQuery =
                  !q ||
                  t.name.toLowerCase().includes(q) ||
                  t.slug.toLowerCase().includes(q) ||
                  (t.phone || '').toLowerCase().includes(q);
                if (!matchesQuery) return false;
                if (superAdminStatusFilter === 'all') return true;
                const status = t.subscriptionStatus || 'active';
                if (superAdminStatusFilter === 'past_due') {
                  return status === 'past_due' || status === 'suspended';
                }
                return status === superAdminStatusFilter;
              });

              return (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                      <span className="text-xs font-semibold text-slate-500 block">
                        Total de Restaurantes na Plataforma
                      </span>
                      <p className="text-2xl font-bold font-mono text-slate-900 mt-1.5">
                        {tenantsToInspect.length}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        {activeCount} assinaturas ativas • {trialCount} em teste grátis
                      </p>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                      <span className="text-xs font-semibold text-slate-500 block">
                        Receita Recorrente Mensal (MRR)
                      </span>
                      <p className="text-2xl font-bold font-mono text-emerald-700 mt-1.5">
                        {formatBRL(estimatedMrrCents)}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Baseado nas assinaturas ativas (Asaas)
                      </p>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                      <span className="text-xs font-semibold text-slate-500 block">
                        Volume de Vendas dos Restaurantes
                      </span>
                      <p className="text-2xl font-bold font-mono text-blue-700 mt-1.5">
                        {formatBRL(totalPlatformGmvCents)}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        {totalPlatformOrders} pedidos processados na plataforma
                      </p>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                      <span className="text-xs font-semibold text-slate-500 block">
                        Assinaturas Pendentes / Expiradas
                      </span>
                      <p className="text-2xl font-bold font-mono text-rose-600 mt-1.5">
                        {overdueCount}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Controle de bloqueio automático ativo
                      </p>
                    </div>
                  </div>

                  {/* Provision / Create New Restaurant Drawer */}
                  {isCreatingNewTenant && (
                    <div className="bg-white border-2 border-indigo-600 rounded-xl p-5 shadow-md space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <div>
                          <h3 className="text-sm font-bold text-slate-900">
                            Cadastrar &amp; Configurar Novo Restaurante na Plataforma
                          </h3>
                          <p className="text-xs text-slate-500">
                            Crie um novo tenant isolado para configurar seus dados, WhatsApp e assinatura.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsCreatingNewTenant(false)}
                          className="text-slate-400 hover:text-slate-700"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (!newTenantName.trim()) return;
                          const cleanSlug =
                            (newTenantSlug.trim() || newTenantName.trim())
                              .toLowerCase()
                              .normalize('NFD')
                              .replace(/[\u0300-\u036f]/g, '')
                              .replace(/[^a-z0-9]+/g, '-')
                              .replace(/(^-|-$)/g, '') || `restaurante-${Date.now()}`;

                          const created: RestaurantTenant = {
                            ...tenant,
                            id: `tenant_${Date.now()}`,
                            name: newTenantName.trim(),
                            slug: cleanSlug,
                            phone: newTenantPhone.trim() || '5511999999999',
                            evolutionInstanceId: cleanSlug,
                            evolutionStatus: 'disconnected',
                            subscriptionStatus: newTenantPlanStatus,
                            trialEndsAt:
                              newTenantPlanStatus === 'trial'
                                ? new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString()
                                : undefined,
                          };

                          if (onCreateTenant) {
                            onCreateTenant(created);
                          }
                          if (onSelectTenant) {
                            onSelectTenant(created);
                          }
                          setNewTenantName('');
                          setNewTenantSlug('');
                          setNewTenantPhone('');
                          setIsCreatingNewTenant(false);
                          setSuperAdminActionNotice(
                            `Restaurante "${created.name}" (${created.slug}) criado e selecionado para configuração!`
                          );
                        }}
                        className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs"
                      >
                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">Nome do Restaurante</label>
                          <input
                            type="text"
                            required
                            value={newTenantName}
                            onChange={(e) => setNewTenantName(e.target.value)}
                            placeholder="Ex: Burger House"
                            className="w-full p-2.5 border border-slate-300 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">Slug (URL da Loja)</label>
                          <input
                            type="text"
                            value={newTenantSlug}
                            onChange={(e) => setNewTenantSlug(e.target.value)}
                            placeholder="Ex: burger-house"
                            className="w-full p-2.5 border border-slate-300 rounded-lg font-mono"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">WhatsApp do Responsável</label>
                          <input
                            type="text"
                            value={newTenantPhone}
                            onChange={(e) => setNewTenantPhone(e.target.value)}
                            placeholder="5511999999999"
                            className="w-full p-2.5 border border-slate-300 rounded-lg font-mono"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">Status Inicial da Assinatura</label>
                          <div className="flex gap-2">
                            <select
                              value={newTenantPlanStatus}
                              onChange={(e) => setNewTenantPlanStatus(e.target.value as 'active' | 'trial')}
                              className="flex-1 p-2.5 border border-slate-300 rounded-lg bg-white font-semibold"
                            >
                              <option value="trial">Teste Grátis 15d</option>
                              <option value="active">Assinatura Ativa</option>
                            </select>
                            <button
                              type="submit"
                              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition-colors cursor-pointer"
                            >
                              Criar
                            </button>
                          </div>
                        </div>
                      </form>
                    </div>
                  )}

                  {/* Restaurants & Subscriptions Management Table */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                      <div>
                        <h2 className="text-base font-bold text-slate-900">
                          Acompanhamento de Assinaturas, Relatórios e Configurações dos Restaurantes
                        </h2>
                        <p className="text-xs text-slate-500">
                          Selecione qualquer restaurante para configurar sua conta, gerenciar sua assinatura ou visualizar seus relatórios de vendas.
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={superAdminSearch}
                            onChange={(e) => setSuperAdminSearch(e.target.value)}
                            placeholder="Buscar restaurante ou slug..."
                            className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:border-indigo-500"
                          />
                        </div>

                        <select
                          value={superAdminStatusFilter}
                          onChange={(e) => setSuperAdminStatusFilter(e.target.value as any)}
                          className="p-1.5 text-xs border border-slate-200 rounded-lg bg-white font-medium text-slate-700"
                        >
                          <option value="all">Todos os Status</option>
                          <option value="active">Assinatura Ativa</option>
                          <option value="trial">Em Teste Grátis (15d)</option>
                          <option value="past_due">Inadimplentes / Suspensos</option>
                        </select>
                      </div>
                    </div>

                    <div className="border border-slate-200 rounded-xl overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                          <tr>
                            <th className="p-3">Restaurante / Slug</th>
                            <th className="p-3">Status da Assinatura</th>
                            <th className="p-3">Instância WhatsApp &amp; Pix</th>
                            <th className="p-3 text-right">Pedidos &amp; Vendas</th>
                            <th className="p-3">Controle de Assinatura</th>
                            <th className="p-3 text-right">Acesso Total (Super Admin)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {filteredTenants.map((itemTenant) => {
                            const isSelected = itemTenant.slug === tenant.slug;
                            const cat = catalogsByTenant[itemTenant.slug];
                            const tenantOrdersCount = cat
                              ? cat.orderIds.length
                              : itemTenant.slug === tenant.slug
                              ? orders.length
                              : 0;
                            const tenantRevenueCents = cat
                              ? cat.orderIds.reduce((sum, id) => {
                                  const o = cat.ordersById[id];
                                  return o && o.status !== 'cancelled' ? sum + (o.totalCents || 0) : sum;
                                }, 0)
                              : itemTenant.slug === tenant.slug
                              ? orders.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + o.totalCents, 0)
                              : 0;

                            const subStatus = itemTenant.subscriptionStatus || 'active';

                            return (
                              <tr
                                key={itemTenant.slug}
                                className={`transition-colors ${
                                  isSelected ? 'bg-indigo-50/50' : 'hover:bg-slate-50'
                                }`}
                              >
                                <td className="p-3">
                                  <div className="flex items-center gap-2.5">
                                    <div
                                      className="w-8 h-8 rounded-lg text-white flex items-center justify-center font-bold text-xs shrink-0"
                                      style={{ backgroundColor: itemTenant.primaryColor || '#2563EB' }}
                                    >
                                      {itemTenant.name.slice(0, 2).toUpperCase()}
                                    </div>
                                    <div>
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-bold text-slate-900">{itemTenant.name}</span>
                                        {isSelected && (
                                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-indigo-600 text-white">
                                            Em foco
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-[11px] font-mono text-slate-500">
                                        slug: {itemTenant.slug} {itemTenant.phone ? `• ${itemTenant.phone}` : ''}
                                      </p>
                                    </div>
                                  </div>
                                </td>

                                <td className="p-3">
                                  {subStatus === 'active' && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                      <span>Assinatura Ativa</span>
                                    </span>
                                  )}
                                  {subStatus === 'trial' && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-sky-50 text-sky-800 border border-sky-200">
                                      <Clock className="w-3.5 h-3.5 text-sky-600" />
                                      <span>Teste Grátis (15 Dias)</span>
                                    </span>
                                  )}
                                  {(subStatus === 'past_due' || subStatus === 'suspended') && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                      <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                                      <span>{subStatus === 'suspended' ? 'Suspensa' : 'Inadimplente / Expirada'}</span>
                                    </span>
                                  )}
                                </td>

                                <td className="p-3">
                                  <div className="space-y-0.5 text-[11px]">
                                    <div className="flex items-center gap-1.5">
                                      <span
                                        className={`w-2 h-2 rounded-full ${
                                          itemTenant.evolutionStatus === 'connected' ? 'bg-emerald-500' : 'bg-amber-500'
                                        }`}
                                      />
                                      <span className="font-mono text-slate-700">
                                        Instância: <strong>{itemTenant.evolutionInstanceId || itemTenant.slug}</strong>
                                      </span>
                                    </div>
                                    <p className="text-slate-500">
                                      Pix:{' '}
                                      {itemTenant.pixKey || itemTenant.pixConfig?.pixKey ? (
                                        <span className="text-emerald-700 font-medium">Configurado</span>
                                      ) : (
                                        <span className="text-amber-700">Pendente</span>
                                      )}
                                    </p>
                                  </div>
                                </td>

                                <td className="p-3 text-right font-mono">
                                  <p className="font-bold text-slate-900">{formatBRL(tenantRevenueCents)}</p>
                                  <p className="text-[11px] text-slate-500">{tenantOrdersCount} pedidos</p>
                                </td>

                                <td className="p-3">
                                  <select
                                    value={subStatus}
                                    onChange={(e) => {
                                      const nextStatus = e.target.value as 'active' | 'trial' | 'past_due' | 'suspended';
                                      const updated: RestaurantTenant = {
                                        ...itemTenant,
                                        subscriptionStatus: nextStatus,
                                        trialEndsAt:
                                          nextStatus === 'trial'
                                            ? new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString()
                                            : itemTenant.trialEndsAt,
                                      };
                                      if (onSelectTenant) onSelectTenant(updated);
                                      onUpdateTenant(updated);
                                      setSuperAdminActionNotice(
                                        `Status da assinatura de "${itemTenant.name}" alterado para "${nextStatus}".`
                                      );
                                    }}
                                    className="p-1.5 text-[11px] border border-slate-300 rounded-lg bg-white text-slate-800 font-semibold"
                                  >
                                    <option value="active">Ativar Assinatura</option>
                                    <option value="trial">Liberar Teste 15d</option>
                                    <option value="past_due">Marcar Inadimplente</option>
                                    <option value="suspended">Suspender Acesso</option>
                                  </select>
                                </td>

                                <td className="p-3 text-right">
                                  <div className="inline-flex flex-wrap justify-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (onSelectTenant) onSelectTenant(itemTenant);
                                        setActiveTab('reports');
                                      }}
                                      className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1"
                                    >
                                      <BarChart3 className="w-3.5 h-3.5" />
                                      <span>Relatórios</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (onSelectTenant) onSelectTenant(itemTenant);
                                        setActiveTab('settings');
                                      }}
                                      className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1"
                                    >
                                      <Settings className="w-3.5 h-3.5" />
                                      <span>Configurar</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (onSelectTenant) onSelectTenant(itemTenant);
                                        setActiveTab('whatsapp');
                                      }}
                                      className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1"
                                    >
                                      <MessageSquare className="w-3.5 h-3.5" />
                                      <span>Infra &amp; WhatsApp</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (onSelectTenant) onSelectTenant(itemTenant);
                                        setActiveTab('billing');
                                      }}
                                      className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1"
                                    >
                                      <CreditCard className="w-3.5 h-3.5" />
                                      <span>Asaas</span>
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 5: WHATSAPP EVOLUTION API & INFRASTRUCTURE                 */}
        {/* ============================================================== */}
        {activeTab === 'whatsapp' && (
          <div className="space-y-4">
            {isSuperAdmin && (
              <div className="bg-indigo-950 text-white border border-indigo-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-indigo-300">
                    <ShieldCheck className="w-4 h-4 text-indigo-400" />
                    <span>CONFIGURAÇÕES DA APLICAÇÃO, EVOLUTION API, N8N &amp; BANCO POSTGRESQL</span>
                  </div>
                  <p className="text-xs text-slate-300">
                    Gerencie servidores, fluxos do n8n, banco de dados e pareamento WhatsApp do restaurante em foco: <strong>{tenant.name}</strong> (<code className="text-indigo-200">{tenant.slug}</code>).
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={tenant.slug}
                    onChange={(e) => {
                      const found = (allTenants.length > 0 ? allTenants : [tenant]).find((t) => t.slug === e.target.value);
                      if (found && onSelectTenant) onSelectTenant(found);
                    }}
                    className="bg-slate-900 border border-indigo-700 text-white text-xs rounded-lg px-3 py-1.5 font-semibold"
                  >
                    {(allTenants.length > 0 ? allTenants : [tenant]).map((t) => (
                      <option key={t.slug} value={t.slug}>
                        Restaurante: {t.name} ({t.slug})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <WhatsAppAutomationView
              tenant={tenant}
              orders={orders}
              onUpdateTenant={onUpdateTenant}
              onSimulateEvolutionReconnect={onSimulateEvolutionReconnect}
              authSession={authSession}
            />
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 6: CRM & CLIENTES ISOLADOS COM HISTÓRICO DE PEDIDOS        */}
        {/* ============================================================== */}
        {activeTab === 'crm' && !isSuperAdmin && (
          <CrmCustomerManagementView
            tenant={tenant}
            orders={orders}
            customers={customers}
            onPrintOrder={(order) => setPrintingOrder(order)}
          />
        )}

        {/* ============================================================== */}
        {/* TAB 7: RELATÓRIOS DE VENDAS POR DIA E PRODUTOS MAIS VENDIDOS   */}
        {/* ============================================================== */}
        {activeTab === 'reports' && (
          <div className="space-y-4">
            {isSuperAdmin && (
              <div className="bg-indigo-950 text-white border border-indigo-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-indigo-300">
                    <BarChart3 className="w-4 h-4 text-indigo-400" />
                    <span>ACOMPANHAMENTO DE RELATÓRIOS DOS RESTAURANTES (SUPER ADMIN)</span>
                  </div>
                  <p className="text-xs text-slate-300">
                    Visualizando relatórios de vendas por dia e produtos mais vendidos de: <strong>{tenant.name}</strong> (<code className="text-indigo-200">{tenant.slug}</code>).
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={tenant.slug}
                    onChange={(e) => {
                      const found = (allTenants.length > 0 ? allTenants : [tenant]).find((t) => t.slug === e.target.value);
                      if (found && onSelectTenant) onSelectTenant(found);
                    }}
                    className="bg-slate-900 border border-indigo-700 text-white text-xs rounded-lg px-3 py-1.5 font-semibold"
                  >
                    {(allTenants.length > 0 ? allTenants : [tenant]).map((t) => (
                      <option key={t.slug} value={t.slug}>
                        Analisar: {t.name} ({t.slug})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setActiveTab('super_subscriptions')}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    Todos os Restaurantes
                  </button>
                </div>
              </div>
            )}

            <AuditedDashboardView
              tenant={tenant}
              orders={orders}
              products={products}
              onNavigateToTab={
                isSuperAdmin
                  ? undefined
                  : (tab) => {
                      if (tab === 'crm') setActiveTab('crm');
                      if (tab === 'kds') setActiveTab('kds');
                      if (tab === 'menu') setActiveTab('menu');
                    }
              }
              onPrintOrder={(order) => setPrintingOrder(order)}
            />
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 8: BILLING & SUBSCRIPTION (R$ 129,90/mês via Asaas)       */}
        {/* ============================================================== */}
        {activeTab === 'billing' && (
          <div className="space-y-4">
            {isSuperAdmin && (
              <div className="bg-indigo-950 text-white border border-indigo-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-indigo-300">
                    <CreditCard className="w-4 h-4 text-indigo-400" />
                    <span>GESTÃO DE ASSINATURA ASAAS DO RESTAURANTE (SUPER ADMIN)</span>
                  </div>
                  <p className="text-xs text-slate-300">
                    Gerenciando plano e faturas Asaas de: <strong>{tenant.name}</strong> (<code className="text-indigo-200">{tenant.slug}</code>).
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={tenant.slug}
                    onChange={(e) => {
                      const found = (allTenants.length > 0 ? allTenants : [tenant]).find((t) => t.slug === e.target.value);
                      if (found && onSelectTenant) onSelectTenant(found);
                    }}
                    className="bg-slate-900 border border-indigo-700 text-white text-xs rounded-lg px-3 py-1.5 font-semibold"
                  >
                    {(allTenants.length > 0 ? allTenants : [tenant]).map((t) => (
                      <option key={t.slug} value={t.slug}>
                        Restaurante: {t.name} ({t.slug})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <AsaasSubscriptionBillingView
              tenant={tenant}
              onUpdateTenant={onUpdateTenant}
              isSuperAdmin={isSuperAdmin}
            />
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 9: INTEGRAÇÃO OFICIAL IFOOD PARTNER API                    */}
        {/* ============================================================== */}
        {activeTab === 'ifood' && (
          <div className="space-y-4">
            {isSuperAdmin && (
              <div className="bg-indigo-950 text-white border border-indigo-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-indigo-300">
                    <Bike className="w-4 h-4 text-red-400" />
                    <span>GESTÃO DE INTEGRAÇÃO IFOOD DO RESTAURANTE (SUPER ADMIN)</span>
                  </div>
                  <p className="text-xs text-slate-300">
                    Configurando vínculo Merchant ID e Webhook iFood para: <strong>{tenant.name}</strong> (<code className="text-indigo-200">{tenant.slug}</code>).
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={tenant.slug}
                    onChange={(e) => {
                      const found = (allTenants.length > 0 ? allTenants : [tenant]).find((t) => t.slug === e.target.value);
                      if (found && onSelectTenant) onSelectTenant(found);
                    }}
                    className="bg-slate-900 border border-indigo-700 text-white text-xs rounded-lg px-3 py-1.5 font-semibold"
                  >
                    {(allTenants.length > 0 ? allTenants : [tenant]).map((t) => (
                      <option key={t.slug} value={t.slug}>
                        Restaurante: {t.name} ({t.slug})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <IfoodIntegrationView
              tenant={tenant}
              orders={orders}
              products={products}
              isSuperAdmin={isSuperAdmin}
              onUpdateTenant={onUpdateTenant}
              onInjectOrder={(newOrder) => {
                if (onAddOrder) onAddOrder(newOrder);
              }}
              onNavigateToTab={(tab) => setActiveTab(tab)}
            />
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 10: CONTROLE DE SALÃO, MESAS & GARÇOM                      */}
        {/* ============================================================== */}
        {activeTab === 'tables' && (
          <TableWaiterManagementView
            tenant={tenant}
            orders={orders}
            products={products}
            categories={categories}
            onAddOrder={(newOrder) => {
              if (onAddOrder) onAddOrder(newOrder);
            }}
            onUpdateOrderStatus={onUpdateOrderStatus}
            onUpdateTenant={onUpdateTenant}
          />
        )}
      </div>

      {/* ============================================================== */}
      {/* MODAL: ADD / EDIT PRODUCT                                      */}
      {/* ============================================================== */}
      {isProductModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-xl overflow-hidden animate-fadeIn">
            <div className="p-4 border-b border-neutral-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-neutral-900">
                {editingProductId ? 'Editar Produto no Cardápio' : 'Cadastrar Novo Produto'}
              </h3>
              <button
                onClick={() => setIsProductModalOpen(false)}
                className="text-neutral-400 hover:text-neutral-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="p-5 overflow-y-auto space-y-4 flex-1">
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">Nome do Prato / Produto</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Pizza Quatro Queijos Especial"
                  value={prodName}
                  onChange={(e) => setProdName(e.target.value)}
                  className="w-full p-2.5 text-xs border border-neutral-200 rounded-lg text-neutral-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">Categoria</label>
                  <select
                    value={prodCategory}
                    onChange={(e) => setProdCategory(e.target.value)}
                    className="w-full p-2.5 text-xs border border-neutral-200 rounded-lg text-neutral-900 bg-white"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">Preço em Reais (R$)</label>
                  <input
                    type="text"
                    required
                    placeholder="34.90"
                    value={prodPriceReal}
                    onChange={(e) => setProdPriceReal(e.target.value)}
                    className="w-full p-2.5 text-xs border border-neutral-200 rounded-lg text-neutral-900 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">Descrição e Ingredientes</label>
                <textarea
                  rows={2}
                  required
                  placeholder="Descreva o prato de forma apetitosa..."
                  value={prodDescription}
                  onChange={(e) => setProdDescription(e.target.value)}
                  className="w-full p-2.5 text-xs border border-neutral-200 rounded-lg text-neutral-900"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-neutral-700">
                    Foto do Prato (Upload do Celular ou Link URL)
                  </label>
                  <label className="relative inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-lg transition-colors cursor-pointer overflow-hidden shadow-2xs">
                    <Upload className="w-3.5 h-3.5 shrink-0" />
                    <span>Enviar Foto do Celular</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleProductImageFileUpload}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  </label>
                </div>

                {prodImageUrl && (
                  <div className="flex items-center gap-3 p-2 bg-neutral-50 border border-neutral-200 rounded-lg">
                    <img
                      src={prodImageUrl}
                      alt="Prévia do prato"
                      className="w-12 h-12 rounded-lg object-cover bg-neutral-200 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold text-emerald-800">
                        Imagem carregada e pronta para o cardápio
                      </p>
                      <button
                        type="button"
                        onClick={() => setProdImageUrl('')}
                        className="text-[11px] text-rose-600 hover:underline font-medium"
                      >
                        Remover foto
                      </button>
                    </div>
                  </div>
                )}

                <input
                  type="text"
                  placeholder="Ou cole o link https://... da imagem"
                  value={prodImageUrl}
                  onChange={(e) => setProdImageUrl(e.target.value)}
                  className="w-full p-2.5 text-xs border border-neutral-200 rounded-lg text-neutral-900 font-mono text-[11px]"
                />
              </div>

              {/* Option Groups Preview in Modal */}
              <div className="border-t border-neutral-200 pt-3 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-neutral-900">Grupos de Adicionais / Variações</span>
                  <button
                    type="button"
                    onClick={() => {
                      setProdOptionGroups([
                        ...prodOptionGroups,
                        {
                          id: `opt_${Date.now()}`,
                          name: 'Novo Adicional',
                          required: false,
                          minSelections: 0,
                          maxSelections: 3,
                          items: [
                            { id: `item_${Date.now()}_1`, name: 'Opção 1', priceCents: 400 },
                          ],
                        },
                      ]);
                    }}
                    className="text-[11px] font-semibold text-neutral-800 bg-neutral-100 hover:bg-neutral-200 px-2 py-1 rounded"
                  >
                    + Adicionar Grupo
                  </button>
                </div>

                {prodOptionGroups.map((grp, gIdx) => (
                  <div key={grp.id} className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg space-y-2 text-xs">
                    <div className="flex justify-between items-center">
                      <input
                        type="text"
                        value={grp.name}
                        onChange={(e) => {
                          const updated = [...prodOptionGroups];
                          updated[gIdx].name = e.target.value;
                          setProdOptionGroups(updated);
                        }}
                        className="font-bold text-xs p-1 border border-neutral-200 rounded bg-white text-neutral-900"
                      />
                      <label className="flex items-center gap-1 text-[11px] text-neutral-600">
                        <input
                          type="checkbox"
                          checked={grp.required}
                          onChange={(e) => {
                            const updated = [...prodOptionGroups];
                            updated[gIdx].required = e.target.checked;
                            setProdOptionGroups(updated);
                          }}
                        />
                        <span>Obrigatório</span>
                      </label>
                    </div>

                    <div className="space-y-1">
                      {grp.items.map((item, iIdx) => (
                        <div key={item.id} className="flex items-center justify-between text-[11px]">
                          <span>• {item.name}</span>
                          <span className="font-mono text-neutral-500 tabular-nums">
                            +{formatBRL(item.priceCents)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t border-neutral-200 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsProductModalOpen(false)}
                  className="w-1/2 py-2.5 text-xs font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-2.5 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors shadow-xs"
                >
                  {editingProductId ? 'Salvar Edição' : 'Cadastrar no Cardápio'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: ADD CATEGORY                                            */}
      {/* ============================================================== */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-5 shadow-xl space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-neutral-900">Nova Categoria de Pratos</h3>
              <button onClick={() => setIsCategoryModalOpen(false)} className="text-neutral-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCategorySubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">Nome da Categoria</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Sobremesas Artesanais"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="w-full p-2.5 text-xs border border-neutral-200 rounded-lg text-neutral-900"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="w-1/2 py-2 text-xs font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-2 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg"
                >
                  Criar Categoria
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* THERMAL TICKET PRINT MODAL (ESC/POS 80mm)                      */}
      {/* ============================================================== */}
      {printingOrder && (
        <ThermalTicketModal
          order={printingOrder}
          tenant={tenant}
          onClose={() => setPrintingOrder(null)}
        />
      )}

      {/* ============================================================== */}
      {/* CUSTOMER ORDER TRACKING MODAL                                  */}
      {/* ============================================================== */}
      {trackingOrderModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in">
          <div className="relative w-full max-w-3xl bg-neutral-100 rounded-2xl overflow-hidden shadow-2xl max-h-[92vh] flex flex-col border border-neutral-300">
            <div className="bg-neutral-900 text-white px-5 py-3 flex items-center justify-between shrink-0">
              <span className="text-xs font-bold flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                <span>Rastreamento em Tempo Real do Consumidor · Pedido #{trackingOrderModal.orderNumber}</span>
              </span>
              <button
                type="button"
                onClick={() => setTrackingOrderModal(null)}
                className="text-neutral-400 hover:text-white p-1 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <OrderTrackingView
                order={trackingOrderModal}
                tenant={tenant}
                onUpdateOrderStatus={(id, nextStatus) => {
                  onUpdateOrderStatus(id, nextStatus);
                  setTrackingOrderModal((prev) => (prev ? { ...prev, status: nextStatus } : null));
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* WHATSAPP QR PAIRING MODAL (ON-SCREEN CAMERA SCAN)              */}
      {/* ============================================================== */}
      <WhatsAppQrPairingModal
        isOpen={isQrPairingModalOpen}
        onClose={() => setIsQrPairingModalOpen(false)}
        tenant={tenant}
        onTenantUpdated={onUpdateTenant}
        isSuperAdmin={authSession?.user?.role === 'SUPER_ADMIN'}
      />

      {/* ============================================================== */}
      {/* MODAL DEDICADO: IMPORTAÇÃO DE CARDÁPIO                         */}
      {/* ============================================================== */}
      {isImportMenuModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-neutral-200 flex flex-col max-h-[90vh] overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 bg-neutral-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold">Importação de Cardápio</h3>
                    <span className="px-2 py-0.5 text-[10px] font-mono font-semibold bg-neutral-800 text-emerald-400 rounded border border-neutral-700">
                      {tenant.name}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Faça o upload da sua planilha (.CSV), confira a visualização prévia da tabela e escolha entre mesclar ou substituir tudo.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsImportMenuModalOpen(false)}
                className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-5">
              {/* 1. Opções de Importação: Mesclar com existente vs Substituir tudo */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-neutral-900">
                  1. Modo de Importação do Cardápio
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setImportMenuMode('merge')}
                    className={`p-3.5 rounded-xl border text-left transition-all ${
                      importMenuMode === 'merge'
                        ? 'border-neutral-900 bg-neutral-900 text-white shadow-xs'
                        : 'border-neutral-200 bg-white text-neutral-800 hover:border-neutral-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold flex items-center gap-2">
                        <input
                          type="radio"
                          checked={importMenuMode === 'merge'}
                          onChange={() => setImportMenuMode('merge')}
                          className="accent-emerald-500"
                        />
                        <span>Mesclar com existente</span>
                      </span>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
                          importMenuMode === 'merge'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-neutral-100 text-neutral-600'
                        }`}
                      >
                        Preserva atuais
                      </span>
                    </div>
                    <p
                      className={`text-[11px] mt-1.5 leading-relaxed ${
                        importMenuMode === 'merge' ? 'text-neutral-300' : 'text-neutral-500'
                      }`}
                    >
                      Mantém as {categories.length} categorias e {products.length} produtos atuais. Cria novas categorias/produtos da planilha e atualiza itens de mesmo nome.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setImportMenuMode('replace')}
                    className={`p-3.5 rounded-xl border text-left transition-all ${
                      importMenuMode === 'replace'
                        ? 'border-orange-600 bg-orange-600 text-white shadow-xs'
                        : 'border-neutral-200 bg-white text-neutral-800 hover:border-neutral-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold flex items-center gap-2">
                        <input
                          type="radio"
                          checked={importMenuMode === 'replace'}
                          onChange={() => setImportMenuMode('replace')}
                          className="accent-white"
                        />
                        <span>Substituir tudo</span>
                      </span>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
                          importMenuMode === 'replace'
                            ? 'bg-white/20 text-white'
                            : 'bg-orange-50 text-orange-700'
                        }`}
                      >
                        Cardápio novo
                      </span>
                    </div>
                    <p
                      className={`text-[11px] mt-1.5 leading-relaxed ${
                        importMenuMode === 'replace' ? 'text-orange-100' : 'text-neutral-500'
                      }`}
                    >
                      Remove todas as categorias e produtos existentes de {tenant.name} e substitui integralmente pelos itens da tabela abaixo.
                    </p>
                  </button>
                </div>
              </div>

              {/* 2. Botão de Upload de Arquivo */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-neutral-900">
                    2. Seleção e Upload de Arquivo (.CSV / Excel)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsImportMenuModalOpen(false);
                      setSpreadsheetModalTab('export');
                    }}
                    className="text-[11px] font-semibold text-emerald-700 hover:underline flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Baixar Planilha Modelo ou Exportar Atual</span>
                  </button>
                </div>

                {importUploadError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{importUploadError}</span>
                  </div>
                )}

                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDraggingImportFile(true);
                  }}
                  onDragLeave={() => setIsDraggingImportFile(false)}
                  onDrop={handleImportFileDrop}
                  className={`border-2 border-dashed rounded-xl p-5 transition-colors flex flex-col sm:flex-row items-center justify-between gap-4 ${
                    isDraggingImportFile
                      ? 'border-emerald-600 bg-emerald-50/50'
                      : 'border-neutral-300 bg-neutral-50 hover:border-neutral-400'
                  }`}
                >
                  <div className="flex items-center gap-3.5 text-center sm:text-left">
                    <div className="w-11 h-11 rounded-xl bg-white border border-neutral-200 flex items-center justify-center text-neutral-700 shadow-2xs shrink-0">
                      <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-neutral-900">
                        Toque em &ldquo;Upload de Arquivo&rdquo; para selecionar do seu celular ou computador
                      </p>
                      <p className="text-[11px] text-neutral-500 mt-0.5">
                        Formatos aceitos no celular e PC: <strong>.CSV</strong>, <strong>.XLSX</strong>, <strong>.XLS</strong>, <strong>.TSV</strong> ou <strong>.TXT</strong>
                      </p>
                      {importFileName && (
                        <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-900">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Arquivo carregado: {importFileName}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-2 shrink-0">
                    <label className="relative inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold rounded-lg transition-colors shadow-xs cursor-pointer overflow-hidden">
                      <Upload className="w-4 h-4 shrink-0" />
                      <span>Upload de Arquivo</span>
                      <input
                        ref={importFileInputRef}
                        type="file"
                        onChange={handleImportFileUpload}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                    </label>

                    <button
                      type="button"
                      onClick={handleLoadSampleImportTable}
                      className="px-3 py-2.5 bg-white hover:bg-neutral-100 text-neutral-700 border border-neutral-300 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                    >
                      Carregar Exemplo
                    </button>
                  </div>
                </div>
              </div>

              {/* 3. Visualização Prévia da Tabela que será Importada */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="block text-xs font-bold text-neutral-900">
                    3. Visualização Prévia da Tabela que será Importada
                  </label>

                  {importPreviewRows.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="px-2.5 py-0.5 rounded-full font-semibold bg-blue-50 text-blue-800 border border-blue-200">
                        {
                          Array.from(
                            new Set(
                              importPreviewRows
                                .filter((r) => r.status !== 'error')
                                .map((r) => r.categoryName.trim())
                            )
                          ).length
                        }{' '}
                        Categorias na tabela
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        {importPreviewRows.filter((r) => r.status === 'valid').length} Produtos válidos
                      </span>
                      {importPreviewRows.some((r) => r.status === 'error') && (
                        <span className="px-2.5 py-0.5 rounded-full font-semibold bg-rose-50 text-rose-800 border border-rose-200">
                          {importPreviewRows.filter((r) => r.status === 'error').length} Com erro
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setImportPreviewRows([]);
                          setImportFileName(null);
                        }}
                        className="text-rose-600 hover:underline font-medium ml-1"
                      >
                        Limpar tabela
                      </button>
                    </div>
                  )}
                </div>

                {importPreviewRows.length === 0 ? (
                  <div className="border border-neutral-200 rounded-xl p-8 text-center bg-neutral-50/60 space-y-2">
                    <p className="text-xs font-semibold text-neutral-700">
                      Nenhum arquivo carregado para visualização prévia.
                    </p>
                    <p className="text-[11px] text-neutral-500 max-w-md mx-auto">
                      Clique em <strong>&quot;Upload de Arquivo&quot;</strong> acima para selecionar sua planilha `.CSV` ou clique em <strong>&quot;Carregar Exemplo&quot;</strong> para inspecionar a tabela prévia.
                    </p>
                  </div>
                ) : (
                  <div className="border border-neutral-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                    {organizedImportPreviewCategories.length > 0 && (
                      <div className="px-4 py-3 bg-emerald-50/40 border-b border-neutral-200 space-y-2">
                        <p className="text-[11px] font-bold text-neutral-800">
                          Ordem de Cadastro das Categorias Identificadas na Planilha:
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {organizedImportPreviewCategories.map((cat) => (
                            <div
                              key={cat.name}
                              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-emerald-200 shadow-2xs text-xs"
                            >
                              <span className="w-5 h-5 rounded-full bg-neutral-900 text-white font-mono text-[10px] font-bold flex items-center justify-center">
                                {cat.order}º
                              </span>
                              <span className="font-bold text-neutral-900">{cat.name}</span>
                              <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-semibold">
                                {cat.count} {cat.count === 1 ? 'item' : 'itens'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="max-h-72 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-neutral-100 border-b border-neutral-200 text-neutral-700 sticky top-0 z-10">
                          <tr>
                            <th className="p-2.5 text-left">Linha</th>
                            <th className="p-2.5 text-left">Categoria</th>
                            <th className="p-2.5 text-left">Produto &amp; Descrição</th>
                            <th className="p-2.5 text-right">Preço</th>
                            <th className="p-2.5 text-center">Disponível</th>
                            <th className="p-2.5 text-left">Ação ({importMenuMode === 'merge' ? 'Mesclar' : 'Substituir'})</th>
                            <th className="p-2.5 text-right">Remover</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-200 text-[11px]">
                          {importPreviewRows.map((row, idx) => {
                            const catExists = categories.some(
                              (c) => normalizeImportStr(c.name) === normalizeImportStr(row.categoryName)
                            );
                            const prodExists = products.some(
                              (p) => normalizeImportStr(p.name) === normalizeImportStr(row.productName)
                            );

                            return (
                              <tr
                                key={`${row.rowNumber}_${idx}`}
                                className={row.status === 'error' ? 'bg-rose-50/60' : 'hover:bg-neutral-50'}
                              >
                                <td className="p-2.5 font-mono text-neutral-400">#{row.rowNumber}</td>
                                <td className="p-2.5">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-mono text-[10px] text-neutral-400">
                                      [{row.categoryOrder}]
                                    </span>
                                    <span className="font-semibold text-neutral-900">
                                      {row.categoryName}
                                    </span>
                                  </div>
                                  {row.status !== 'error' && (
                                    <span
                                      className={`inline-block mt-0.5 text-[9px] font-mono px-1.5 py-0.2 rounded ${
                                        importMenuMode === 'replace' || !catExists
                                          ? 'bg-blue-50 text-blue-700'
                                          : 'bg-neutral-100 text-neutral-600'
                                      }`}
                                    >
                                      {importMenuMode === 'replace'
                                        ? 'Recriar Categoria'
                                        : catExists
                                        ? 'Categoria Existente'
                                        : 'Nova Categoria'}
                                    </span>
                                  )}
                                </td>
                                <td className="p-2.5">
                                  {row.status === 'category_only' ? (
                                    <span className="italic text-neutral-400">
                                      (Apenas cadastro da categoria)
                                    </span>
                                  ) : (
                                    <div>
                                      <p className="font-bold text-neutral-900">{row.productName}</p>
                                      {row.description && (
                                        <p className="text-neutral-500 truncate max-w-xs">
                                          {row.description}
                                        </p>
                                      )}
                                      {row.optionGroups.length > 0 && (
                                        <p className="text-[10px] text-emerald-700 font-medium mt-0.5">
                                          + {row.optionGroups.length} grupo(s) de adicionais
                                        </p>
                                      )}
                                    </div>
                                  )}
                                </td>
                                <td className="p-2.5 text-right font-mono font-bold text-neutral-900 tabular-nums">
                                  {row.status === 'category_only' ? '—' : formatBRL(row.priceCents)}
                                </td>
                                <td className="p-2.5 text-center">
                                  {row.status === 'category_only' ? (
                                    '—'
                                  ) : (
                                    <span
                                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                        row.isAvailable
                                          ? 'bg-emerald-50 text-emerald-800'
                                          : 'bg-neutral-100 text-neutral-600'
                                      }`}
                                    >
                                      {row.isAvailable ? 'Sim' : 'Pausado'}
                                    </span>
                                  )}
                                </td>
                                <td className="p-2.5">
                                  {row.status === 'error' ? (
                                    <span className="text-rose-700 font-semibold flex items-center gap-1">
                                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                      {row.errorMessage}
                                    </span>
                                  ) : importMenuMode === 'replace' ? (
                                    <span className="text-orange-700 font-semibold flex items-center gap-1">
                                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                      Substituir no novo menu
                                    </span>
                                  ) : prodExists ? (
                                    <span className="text-amber-700 font-semibold flex items-center gap-1">
                                      <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                                      Atualizar existente
                                    </span>
                                  ) : (
                                    <span className="text-emerald-700 font-semibold flex items-center gap-1">
                                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                      Adicionar novo
                                    </span>
                                  )}
                                </td>
                                <td className="p-2.5 text-right">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setImportPreviewRows((prev) => prev.filter((_, i) => i !== idx))
                                    }
                                    className="p-1 text-neutral-400 hover:text-rose-600 rounded transition-colors"
                                    title="Ignorar esta linha na importação"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-neutral-50 border-t border-neutral-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
              <div className="text-[11px] text-neutral-500">
                Modo selecionado:{' '}
                <strong className="text-neutral-900">
                  {importMenuMode === 'merge' ? 'Mesclar com existente' : 'Substituir tudo'}
                </strong>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsImportMenuModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-200 rounded-lg transition-colors"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  disabled={
                    importPreviewRows.filter((r) => r.status === 'valid' || r.status === 'category_only')
                      .length === 0
                  }
                  onClick={handleConfirmMenuImportModal}
                  className={`flex items-center gap-2 px-5 py-2 text-xs font-bold rounded-lg transition-colors shadow-xs ${
                    importPreviewRows.filter((r) => r.status === 'valid' || r.status === 'category_only')
                      .length > 0
                      ? importMenuMode === 'replace'
                        ? 'bg-orange-600 hover:bg-orange-700 text-white'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {importMenuMode === 'replace'
                      ? 'Substituir Tudo e Importar Cardápio'
                      : 'Mesclar com Existente e Importar'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* SPREADSHEET EXPORT & IMPORT MODAL (CATEGORIES + PRODUCTS)      */}
      {/* ============================================================== */}
      <MenuSpreadsheetModal
        isOpen={spreadsheetModalTab !== null}
        initialTab={spreadsheetModalTab || 'export'}
        onClose={() => setSpreadsheetModalTab(null)}
        tenant={tenant}
        categories={categories}
        products={products}
        onImportCatalog={(newCategories, newProducts, mode) => {
          if (onImportCatalog) {
            onImportCatalog(newCategories, newProducts, mode);
          } else {
            // Fallback if onImportCatalog wasn't provided
            newCategories.forEach((cat) => {
              if (!categories.some((c) => c.id === cat.id)) {
                onAddCategory(cat.name);
              }
            });
            newProducts.forEach((prod) => {
              if (products.some((p) => p.id === prod.id)) {
                onUpdateProduct(prod);
              } else {
                onAddProduct(prod);
              }
            });
          }
          triggerSyncNotice(
            `Cardápio atualizado via planilha: ${newCategories.length} categorias e ${newProducts.length} produtos sincronizados para ${tenant.name}!`
          );
        }}
      />
    </div>
  );
};
