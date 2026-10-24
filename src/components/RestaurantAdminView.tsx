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
import { AuthSession, Category, CustomerRecord, DeliveryZone, OptionGroup, OptionItem, Order, OrderStatus, PixGatewayConfig, Product, RestaurantTenant, UserRole } from '../types';
import { ThermalTicketModal } from './ThermalTicketModal';
import { ConsumerMenuView } from './ConsumerMenuView';
import { WhatsAppAutomationView } from './WhatsAppAutomationView';
import { OrderTrackingView } from './OrderTrackingView';
import { WhatsAppQrPairingModal } from './WhatsAppQrPairingModal';
import { AsaasSubscriptionBillingView } from './AsaasSubscriptionBillingView';
import { AuditedDashboardView } from './AuditedDashboardView';
import { CrmCustomerManagementView } from './CrmCustomerManagementView';
import {
  MenuSpreadsheetModal,
  ParsedRowPreview,
  parseSpreadsheetLines,
  parsePriceBRLToCents,
  parseOptionGroupsFromCell,
  escapeCsvCell,
} from './MenuSpreadsheetModal';

interface RestaurantAdminViewProps {
  tenant: RestaurantTenant;
  orders: Order[];
  products: Product[];
  categories: Category[];
  customers: CustomerRecord[];
  allTenants?: RestaurantTenant[];
  onSelectTenant?: (tenant: RestaurantTenant) => void;
  onUpdateTenant: (updatedTenant: RestaurantTenant) => void;
  onUpdateOrderStatus: (orderId: string, nextStatus: OrderStatus) => void;
  onToggleProductAvailability: (productId: string) => void;
  onAddProduct: (newProduct: Product) => void;
  onUpdateProduct: (updatedProduct: Product) => void;
  onDeleteProduct: (productId: string) => void;
  onAddCategory: (categoryName: string) => void;
  onImportCatalog?: (newCategories: Category[], newProducts: Product[], mode: 'merge' | 'replace') => void;
  onSimulateEvolutionReconnect: () => void;
  authSession?: AuthSession;
  onOpenAuthPortal?: () => void;
}

export const RestaurantAdminView: React.FC<RestaurantAdminViewProps> = ({
  tenant,
  orders,
  products,
  categories,
  customers,
  allTenants = [],
  onSelectTenant,
  onUpdateTenant,
  onUpdateOrderStatus,
  onToggleProductAvailability,
  onAddProduct,
  onUpdateProduct,
  onDeleteProduct,
  onAddCategory,
  onImportCatalog,
  onSimulateEvolutionReconnect,
  authSession,
  onOpenAuthPortal,
}) => {
  const [activeTab, setActiveTab] = useState<'kds' | 'menu' | 'categories' | 'settings' | 'billing' | 'whatsapp' | 'crm' | 'reports'>('menu');
  const [printingOrder, setPrintingOrder] = useState<Order | null>(null);
  const [trackingOrderModal, setTrackingOrderModal] = useState<Order | null>(null);
  const [statusUpdateToast, setStatusUpdateToast] = useState<string | null>(null);
  const [testMsgStatus, setTestMsgStatus] = useState<string | null>(null);
  const [isQrPairingModalOpen, setIsQrPairingModalOpen] = useState(false);
  const [spreadsheetModalTab, setSpreadsheetModalTab] = useState<'export' | 'import' | null>(null);

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
    if (authSession.user.role === 'KITCHEN_STAFF') {
      setUserRole('kitchen');
      setActiveTab('kds');
    } else {
      setUserRole('owner');
    }
  }, [authSession]);

  const handleKdsStatusChange = (order: Order, nextStatus: OrderStatus) => {
    onUpdateOrderStatus(order.id, nextStatus);
    setStatusUpdateToast(
      `Status do Pedido #${order.orderNumber} alterado para "${nextStatus}". Notificação disparada no WhatsApp de ${order.customerName} via Evolution API!`
    );
    setTimeout(() => setStatusUpdateToast(null), 5000);
  };

  // Live Sync & Walkthrough state
  const [liveSyncNotice, setLiveSyncNotice] = useState<string | null>(null);
  const [showLivePreviewSplit, setShowLivePreviewSplit] = useState(false);
  const [showHowItWorksModal, setShowHowItWorksModal] = useState(false);

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

  // Pix Key Editor state (Cada restaurante edita sua própria chave Pix direta)
  const [isEditingPixKey, setIsEditingPixKey] = useState(false);
  const [pixKey, setPixKey] = useState(tenant.pixConfig?.pixKey || tenant.phone || '');
  const [pixKeyType, setPixKeyType] = useState<PixGatewayConfig['pixKeyType']>(tenant.pixConfig?.pixKeyType || 'phone');
  const [pixMerchantName, setPixMerchantName] = useState(tenant.pixConfig?.merchantName || tenant.name || 'MEU RESTAURANTE');
  const [pixMerchantCity, setPixMerchantCity] = useState(tenant.pixConfig?.merchantCity || 'SAO PAULO');
  const [pixBankName, setPixBankName] = useState(tenant.pixConfig?.bankName || 'Conta PJ');
  const [pixProvider, setPixProvider] = useState<PixGatewayConfig['provider']>(tenant.pixConfig?.provider || 'direct_bank');
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

    // Sync Pix Config when tenant switches
    setPixKey(tenant.pixConfig?.pixKey || tenant.phone || '');
    setPixKeyType(tenant.pixConfig?.pixKeyType || 'phone');
    setPixMerchantName(tenant.pixConfig?.merchantName || tenant.name || 'MEU RESTAURANTE');
    setPixMerchantCity(tenant.pixConfig?.merchantCity || 'SAO PAULO');
    setPixBankName(tenant.pixConfig?.bankName || 'Conta PJ');
    setPixProvider(tenant.pixConfig?.provider || 'direct_bank');
    setIsEditingPixKey(false);
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

  const handleOpenAddProduct = () => {
    setEditingProductId(null);
    setProdName('');
    setProdCategory(categories[0]?.id || '');
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
      const findCol = (keywords: string[], fallback: number) => {
        const found = firstRowLower.findIndex((h) => keywords.some((kw) => h.includes(kw)));
        return found >= 0 ? found : fallback;
      };
      const hasProductCol = firstRowLower.some(
        (h) => h.includes('nome_produto') || h === 'produto' || h === 'prato' || h === 'item'
      );
      idxOrder = findCol(['ordem', 'order', 'posicao'], 0);
      idxCategory = findCol(['categoria', 'category', 'secao'], firstRowLower.length === 1 ? 0 : 1);

      if (!hasProductCol && firstRowLower.length <= 3) {
        idxProductName = -1;
        idxDescription = -1;
        idxPrice = -1;
        idxAvailable = -1;
        idxFeatured = -1;
        idxImage = -1;
        idxOptions = -1;
      } else {
        idxProductName = findCol(['nome_produto', 'produto', 'prato', 'nome', 'item'], 2);
        idxDescription = findCol(['descricao', 'description', 'ingredientes', 'detalhe'], 3);
        idxPrice = findCol(['preco', 'valor', 'price'], 4);
        idxAvailable = findCol(['disponivel', 'ativo', 'status', 'available'], 5);
        idxFeatured = findCol(['destaque', 'featured', 'promocao'], 6);
        idxImage = findCol(['imagem', 'foto', 'image', 'url'], 7);
        idxOptions = findCol(['adicionais', 'opcoes', 'complementos', 'options'], 8);
      }
    }

    const dataRows = hasHeader ? rawRows.slice(1) : rawRows;
    const previews: ParsedRowPreview[] = [];

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

      const categoryOrder = !isNaN(Number(orderRaw)) && Number(orderRaw) > 0 ? parseInt(orderRaw, 10) : idx + 1;

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

  const handleImportFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = String(event.target?.result || '');
      handleProcessImportSpreadsheet(content, file.name);
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  };

  const handleImportFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingImportFile(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = String(event.target?.result || '');
      handleProcessImportSpreadsheet(content, file.name);
    };
    reader.readAsText(file, 'UTF-8');
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

  const handleConfirmMenuImportModal = () => {
    const validRows = importPreviewRows.filter((r) => r.status === 'valid' || r.status === 'category_only');
    const validProductRows = importPreviewRows.filter((r) => r.status === 'valid');
    if (validRows.length === 0) return;

    const baseCategories: Category[] = importMenuMode === 'replace' ? [] : [...categories];
    const baseProducts: Product[] = importMenuMode === 'replace' ? [] : [...products];

    const categoryMapByNormName = new Map<string, Category>();
    baseCategories.forEach((cat) => {
      categoryMapByNormName.set(normalizeImportStr(cat.name), cat);
    });

    validRows.forEach((row) => {
      const normCat = normalizeImportStr(row.categoryName);
      if (!categoryMapByNormName.has(normCat)) {
        const newCat: Category = {
          id: `cat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: row.categoryName.trim(),
          order: row.categoryOrder || categoryMapByNormName.size + 1,
        };
        categoryMapByNormName.set(normCat, newCat);
        baseCategories.push(newCat);
      } else {
        const existingCat = categoryMapByNormName.get(normCat)!;
        if (row.categoryOrder && importMenuMode === 'replace') {
          existingCat.order = row.categoryOrder;
        }
      }
    });

    const finalCategories = [...baseCategories].sort((a, b) => a.order - b.order);
    const finalProducts = [...baseProducts];

    validProductRows.forEach((row, idx) => {
      const normCat = normalizeImportStr(row.categoryName);
      const targetCat = categoryMapByNormName.get(normCat)!;
      const normProd = normalizeImportStr(row.productName);

      const existingProdIndex = finalProducts.findIndex(
        (p) => p.categoryId === targetCat.id && normalizeImportStr(p.name) === normProd
      );

      if (existingProdIndex >= 0) {
        finalProducts[existingProdIndex] = {
          ...finalProducts[existingProdIndex],
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
        ? `Cardápio substituído com sucesso: ${finalCategories.length} categorias e ${finalProducts.length} produtos ativos em ${tenant.name}!`
        : `Cardápio mesclado com sucesso: ${finalCategories.length} categorias e ${finalProducts.length} produtos sincronizados em ${tenant.name}!`
    );

    setIsImportMenuModalOpen(false);
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    const deliveryFeeCents = Math.round(parseFloat(settingsDeliveryFee.replace(',', '.')) * 100) || 0;
    const minOrderCents = Math.round(parseFloat(settingsMinOrder.replace(',', '.')) * 100) || 0;

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
    };

    onUpdateTenant(updated);
    setSettingsSuccessNotice('Configurações atualizadas com sucesso! As alterações já estão no ar.');
    setTimeout(() => setSettingsSuccessNotice(null), 3500);
  };

  const handleSavePixConfig = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!pixKey.trim()) return;

    setPixSaving(true);
    try {
      const payload: PixGatewayConfig = {
        provider: 'direct_bank',
        pixKey: pixKey.trim(),
        pixKeyType: pixKeyType,
        merchantName: pixMerchantName.trim().slice(0, 25),
        merchantCity: pixMerchantCity.trim().slice(0, 15).toUpperCase(),
        bankName: pixBankName.trim() || 'Conta Bancária da Loja',
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
        pixConfig: payload,
      };

      onUpdateTenant(updatedTenant);
      setIsEditingPixKey(false);
      setPixSaveNotice(`Chave Pix salva com sucesso para ${tenant.name}!`);
      setStatusUpdateToast(`✅ Chave Pix de ${tenant.name} atualizada para "${pixKey.trim()}"!`);
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
    <div className="bg-neutral-50 border border-neutral-200 rounded-xl overflow-hidden min-h-[720px] flex flex-col">
      {/* Top Header of the Restaurant Member Area */}
      <div className="bg-white border-b border-neutral-200 px-6 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div
            className="w-10 h-10 rounded-lg text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0"
            style={{ backgroundColor: tenant.primaryColor }}
          >
            {tenant.name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs text-neutral-500">
              <span className="font-bold text-neutral-900">{tenant.name}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono text-[11px]">slug: {tenant.slug}</span>
              <span aria-hidden="true">·</span>
              <span className="text-emerald-700 font-medium">Assinatura R$ 129,90/mês (Ativa)</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className="text-[11px] text-neutral-500 font-medium">Perfil RBAC:</span>
              <div className="inline-flex rounded-lg border border-neutral-200 bg-neutral-100 p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setUserRole('owner')}
                  className={`px-2 py-0.5 rounded-md font-medium transition-colors ${
                    userRole === 'owner'
                      ? 'bg-white text-neutral-900 shadow-2xs font-semibold'
                      : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  👑 Proprietário (Total)
                </button>
                <button
                  type="button"
                  onClick={() => setUserRole('manager')}
                  className={`px-2 py-0.5 rounded-md font-medium transition-colors ${
                    userRole === 'manager'
                      ? 'bg-white text-neutral-900 shadow-2xs font-semibold'
                      : 'text-neutral-600 hover:text-neutral-900'
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
                      ? 'bg-white text-neutral-900 shadow-2xs font-semibold'
                      : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  🍳 Cozinha (KDS)
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Tenant selector and WhatsApp Status */}
        <div className="flex flex-wrap items-center gap-3">
          {authSession && authSession.user.role !== 'SUPER_ADMIN' ? (
            <div className="flex items-center gap-2 px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-md text-xs text-emerald-900">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>
                RLS Isolado: <strong>{tenant.name}</strong> ({authSession.user.role})
              </span>
              {onOpenAuthPortal && (
                <button
                  type="button"
                  onClick={onOpenAuthPortal}
                  className="underline font-bold text-emerald-800 hover:text-emerald-950 ml-1"
                >
                  Trocar Sessão JWT
                </button>
              )}
            </div>
          ) : (
            allTenants &&
            allTenants.length > 1 &&
            onSelectTenant && (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-neutral-500">Trocar Loja (Super Admin):</span>
                <select
                  value={tenant.slug}
                  onChange={(e) => {
                    const found = allTenants.find((t) => t.slug === e.target.value);
                    if (found) onSelectTenant(found);
                  }}
                  className="bg-neutral-100 border border-neutral-200 text-neutral-800 text-xs rounded-md px-2 py-1 font-medium"
                >
                  {allTenants.map((t) => (
                    <option key={t.slug} value={t.slug}>
                      {t.name} ({t.slug})
                    </option>
                  ))}
                </select>
              </div>
            )
          )}

          <button
            type="button"
            onClick={() => setIsQrPairingModalOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 border border-neutral-200/80 rounded-lg text-xs cursor-pointer transition-colors shadow-2xs group"
            title="Clique para abrir o Pareamento com Evolution API via QR Code na tela"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                tenant.evolutionStatus === 'connected' ? 'bg-emerald-500 ring-2 ring-emerald-200' : 'bg-rose-500 ring-2 ring-rose-200 animate-pulse'
              }`}
            />
            <span className="text-neutral-700 font-medium group-hover:text-neutral-900">
              WhatsApp {tenant.evolutionStatus === 'connected' ? 'Conectado' : 'Desconectado'}
            </span>
            <QrCode className="w-3.5 h-3.5 text-neutral-400 group-hover:text-neutral-700 ml-0.5" />
          </button>

          <a
            href={`#cardapio-${tenant.slug}`}
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="px-3 py-1.5 text-xs font-semibold text-white rounded-lg shadow-xs transition-opacity hover:opacity-90"
            style={{ backgroundColor: tenant.primaryColor }}
          >
            Ver Cardápio Público
          </a>
        </div>
      </div>

      {/* Real-time Synchronization Notice */}
      {liveSyncNotice && (
        <div className="bg-emerald-600 text-white px-6 py-2.5 text-xs font-medium flex items-center justify-between shadow-xs transition-all">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-200" />
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
      {userRole === 'kitchen' && (
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

      {/* Tabs navigation */}
      <div className="bg-white border-b border-neutral-200 px-6 flex gap-6 text-xs font-medium overflow-x-auto">
        <button
          onClick={() => setActiveTab('menu')}
          className={`py-3 border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'menu'
              ? 'border-neutral-900 text-neutral-900 font-semibold'
              : 'border-transparent text-neutral-500 hover:text-neutral-800'
          }`}
        >
          <Utensils className="w-4 h-4" />
          <span>Cardápio &amp; Produtos</span>
          <span className="bg-neutral-100 text-neutral-700 text-[10px] px-1.5 py-0.5 rounded-full font-mono">
            {products.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('categories')}
          className={`py-3 border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'categories'
              ? 'border-neutral-900 text-neutral-900 font-semibold'
              : 'border-transparent text-neutral-500 hover:text-neutral-800'
          }`}
        >
          <span>Categorias &amp; Grupos</span>
        </button>

        <button
          onClick={() => setActiveTab('kds')}
          className={`py-3 border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'kds'
              ? 'border-neutral-900 text-neutral-900 font-semibold'
              : 'border-transparent text-neutral-500 hover:text-neutral-800'
          }`}
        >
          <LayoutGrid className="w-4 h-4" />
          <span>Gestão de Pedidos (KDS)</span>
          {ordersByStatus.received.length > 0 && (
            <span className="bg-orange-600 text-white text-[10px] px-1.5 py-0.2 rounded-full font-mono">
              {ordersByStatus.received.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`py-3 border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'settings'
              ? 'border-neutral-900 text-neutral-900 font-semibold'
              : 'border-transparent text-neutral-500 hover:text-neutral-800'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Configurações &amp; Identidade</span>
        </button>

        <button
          onClick={() => setActiveTab('billing')}
          className={`py-3 border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'billing'
              ? 'border-neutral-900 text-neutral-900 font-semibold'
              : 'border-transparent text-neutral-500 hover:text-neutral-800'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>Assinatura (R$ 129,90/mês)</span>
        </button>

        <button
          onClick={() => setActiveTab('whatsapp')}
          className={`py-3 border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'whatsapp'
              ? 'border-neutral-900 text-neutral-900 font-semibold'
              : 'border-transparent text-neutral-500 hover:text-neutral-800'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span>WhatsApp (Evolution API)</span>
        </button>

        <button
          onClick={() => setActiveTab('crm')}
          className={`py-3 border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'crm'
              ? 'border-neutral-900 text-neutral-900 font-semibold'
              : 'border-transparent text-neutral-500 hover:text-neutral-800'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>CRM &amp; Clientes</span>
          <span className="bg-neutral-100 text-neutral-700 text-[10px] px-1.5 py-0.5 rounded-full font-mono">
            {customers.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('reports')}
          className={`py-3 border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'reports'
              ? 'border-neutral-900 text-neutral-900 font-semibold'
              : 'border-transparent text-neutral-500 hover:text-neutral-800'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Dashboard &amp; Vendas</span>
          <span className="bg-emerald-100 text-emerald-800 text-[9px] px-1.5 py-0.2 rounded font-semibold uppercase tracking-wider">
            Auditado
          </span>
        </button>
      </div>

      {/* Main Content Body */}
      <div className="p-6 flex-1 overflow-y-auto">
        {/* ============================================================== */}
        {/* TAB 1: MENU & PRODUCTS CRUD                                    */}
        {/* ============================================================== */}
        {activeTab === 'menu' && (
          <div className="space-y-5">
            {/* Explanatory Banner & Interactive Architecture Guide: Como funciona a atualização dos dados por restaurante */}
            <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-2xs space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-neutral-100">
                <div className="flex items-start gap-2.5">
                  <div className="p-2 rounded-lg bg-orange-50 text-orange-700 mt-0.5 shrink-0">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-neutral-900">
                      Como Funciona a Atualização dos Dados do Cardápio por Restaurante
                    </h3>
                    <p className="text-xs text-neutral-600 mt-0.5">
                      Entenda o ciclo completo de vida de uma alteração de cardápio no SaaS, desde a edição até a tela do cliente.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowHowItWorksModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors"
                  >
                    <HelpCircle className="w-3.5 h-3.5 text-neutral-500" />
                    <span>Ver Arquitetura Técnica</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowLivePreviewSplit(!showLivePreviewSplit)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                      showLivePreviewSplit
                        ? 'bg-neutral-900 text-white'
                        : 'bg-orange-50 text-orange-900 hover:bg-orange-100 border border-orange-200'
                    }`}
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>{showLivePreviewSplit ? 'Ocultar Celular do Cliente' : 'Modo Lado a Lado (Celular)'}</span>
                  </button>
                </div>
              </div>

              {/* 4 Interactive Visual Pillars of Menu Updates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
                  <span className="font-mono text-[10px] text-neutral-400 font-bold">ETAPA 1</span>
                  <p className="font-bold text-neutral-900 mt-1">1. Edição no Painel Web</p>
                  <p className="text-[11px] text-neutral-600 mt-0.5 leading-relaxed">
                    O lojista altera preços, descrições, fotos ou pausa pratos esgotados com apenas 1 clique no botão de status.
                  </p>
                </div>

                <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
                  <span className="font-mono text-[10px] text-neutral-400 font-bold">ETAPA 2</span>
                  <p className="font-bold text-neutral-900 mt-1">2. Isolamento via RLS</p>
                  <p className="text-[11px] text-neutral-600 mt-0.5 leading-relaxed">
                    A API grava no PostgreSQL usando Row-Level Security (<code className="bg-neutral-200 px-1 py-0.2 rounded font-mono text-[10px]">tenant_id</code>), blindando os dados contra outros restaurantes.
                  </p>
                </div>

                <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
                  <span className="font-mono text-[10px] text-neutral-400 font-bold">ETAPA 3</span>
                  <p className="font-bold text-neutral-900 mt-1">3. Propagação em Tempo Real</p>
                  <p className="text-[11px] text-neutral-600 mt-0.5 leading-relaxed">
                    O link público e os QR Codes dos clientes não usam cache estático defasado: o novo preço entra no ar imediatamente no celular do cliente.
                  </p>
                </div>

                <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
                  <span className="font-mono text-[10px] text-neutral-400 font-bold">ETAPA 4</span>
                  <p className="font-bold text-neutral-900 mt-1">4. Snapshot Imutável</p>
                  <p className="text-[11px] text-neutral-600 mt-0.5 leading-relaxed">
                    Mudar o preço hoje NÃO altera os pedidos já concluídos ontem: o histórico de faturamento e notas fiscais permanece 100% íntegro.
                  </p>
                </div>
              </div>
            </div>

            {/* Split Screen Container (if toggled) */}
            <div className={`grid gap-6 ${showLivePreviewSplit ? 'grid-cols-1 xl:grid-cols-12' : 'grid-cols-1'}`}>
              {/* Left Column: Product Management */}
              <div className={showLivePreviewSplit ? 'xl:col-span-7 space-y-4' : 'space-y-4'}>
                {/* Search & Actions Toolbar */}
                <div className="bg-white border border-neutral-200 rounded-lg p-3.5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        placeholder="Buscar por prato ou ingrediente..."
                        value={productSearchQuery}
                        onChange={(e) => setProductSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg text-xs focus:bg-white focus:outline-neutral-900"
                      />
                    </div>

                    <select
                      value={selectedCategoryFilter}
                      onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                      className="bg-neutral-50 border border-neutral-200 text-neutral-800 text-xs rounded-lg px-2.5 py-1.5 font-medium"
                    >
                      <option value="all">Todas as Categorias ({products.length})</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({products.filter((p) => p.categoryId === c.id).length})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setSpreadsheetModalTab('export')}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors"
                      title="Exportar categorias e produtos para planilha Excel / CSV ou baixar planilha modelo"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Exportar Planilha</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsImportMenuModalOpen(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-neutral-800 bg-neutral-100 hover:bg-neutral-200 border border-neutral-200 rounded-lg transition-colors"
                      title="Abrir modal de Importação de Cardápio com upload de arquivo e pré-visualização da tabela"
                    >
                      <Upload className="w-3.5 h-3.5 text-neutral-600" />
                      <span>Importação de Cardápio</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsBulkAdjustOpen(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors"
                      title="Aplicar aumento ou desconto percentual em massa"
                    >
                      <Percent className="w-3.5 h-3.5 text-neutral-500" />
                      <span>Reajuste em Lote</span>
                    </button>

                    <button
                      onClick={handleOpenAddProduct}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors shadow-xs"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Novo Produto</span>
                    </button>
                  </div>
                </div>

                {/* Products Table */}
                <div className="bg-white border border-neutral-200 rounded-lg overflow-hidden shadow-2xs">
                  <div className="p-3.5 border-b border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-neutral-900">
                        Cardápio Oficial de {tenant.name}
                      </h4>
                      <p className="text-[11px] text-neutral-500">
                        Clique em &quot;Disponível / Pausado&quot; para esgotar itens rapidamente na hora do rush.
                      </p>
                    </div>

                    <div className="text-[11px] text-neutral-500 font-mono">
                      Exibindo {filteredProducts.length} de {products.length} itens
                    </div>
                  </div>

                  {filteredProducts.length === 0 ? (
                    <div className="p-8 text-center text-xs text-neutral-500">
                      Nenhum produto encontrado com os filtros atuais.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-700 font-semibold">
                          <tr>
                            <th className="p-3 text-left">Foto / Nome do Produto</th>
                            <th className="p-3 text-left">Categoria</th>
                            <th className="p-3 text-right">Preço</th>
                            <th className="p-3 text-center">Status no Menu</th>
                            <th className="p-3 text-right">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-200">
                          {filteredProducts.map((prod) => {
                            const categoryObj = categories.find((c) => c.id === prod.categoryId);
                            return (
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
                                      <p className="text-[10px] text-neutral-400 mt-0.5">
                                        {prod.optionGroups.length} grupo(s) de adicionais
                                      </p>
                                    )}
                                  </div>
                                </td>
                                <td className="p-3 text-neutral-600 font-medium">
                                  {categoryObj ? categoryObj.name : 'Geral'}
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
                                        if (confirm(`Tem certeza que deseja excluir "${prod.name}" do cardápio?`)) {
                                          onDeleteProduct(prod.id);
                                          triggerSyncNotice(`Prato "${prod.name}" removido do cardápio.`);
                                        }
                                      }}
                                      className="p-1.5 text-rose-600 hover:text-rose-900 hover:bg-rose-50 rounded transition-colors"
                                      title="Excluir Produto"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
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

            {/* Technical Architecture Modal for Menu Updates */}
            {showHowItWorksModal && (
              <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
                <div className="bg-white rounded-xl max-w-2xl w-full p-6 shadow-2xl border border-neutral-200 space-y-4 max-h-[85vh] overflow-y-auto">
                  <div className="flex items-center justify-between pb-3 border-b border-neutral-200">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-emerald-600" />
                      <h3 className="text-sm font-bold text-neutral-900">
                        Arquitetura de Atualização do Cardápio por Restaurante
                      </h3>
                    </div>
                    <button
                      onClick={() => setShowHowItWorksModal(false)}
                      className="text-neutral-400 hover:text-neutral-700"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-3 text-xs text-neutral-700 leading-relaxed">
                    <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
                      <p className="font-bold text-neutral-900">1. Por que um restaurante nunca altera o cardápio de outro?</p>
                      <p className="mt-1">
                        O SaaS utiliza <strong>Row-Level Security (RLS)</strong> no PostgreSQL. Em cada requisição de alteração de produto, o backend extrai o <code className="bg-neutral-200 px-1 py-0.2 rounded font-mono text-[11px]">tenant_id</code> do JWT assinado e executa:
                      </p>
                      <pre className="bg-neutral-900 text-neutral-100 p-2.5 rounded font-mono text-[11px] mt-1.5 overflow-x-auto">
{`SET LOCAL app.current_tenant_id = 'tenant_brasas_01';
UPDATE products SET price_cents = 3990, is_available = true 
WHERE id = 'prod_smash_bacon' AND tenant_id = current_setting('app.current_tenant_id');`}
                      </pre>
                      <p className="mt-1 text-neutral-600 text-[11px]">
                        Mesmo que um invasor tente enviar o ID de produto de outro restaurante, a política RLS retorna 0 linhas afetadas no banco de dados.
                      </p>
                    </div>

                    <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
                      <p className="font-bold text-neutral-900">2. Como o celular do cliente atualiza tão rápido?</p>
                      <p className="mt-1">
                        O cardápio público consulta a rota <code className="bg-neutral-200 px-1 py-0.2 rounded font-mono text-[11px]">GET /api/v1/tenants/:slug/products</code>. O servidor responde com cabeçalhos HTTP inteligentes:
                      </p>
                      <pre className="bg-neutral-900 text-neutral-100 p-2.5 rounded font-mono text-[11px] mt-1.5 overflow-x-auto">
{`Cache-Control: public, max-age=15, stale-while-revalidate=60
ETag: "catalog_version_1729482930"`}
                      </pre>
                      <p className="mt-1 text-neutral-600 text-[11px]">
                        Assim, quando o lojista altera o preço ou pausa um item, a versão do catálogo é incrementada e o celular do cliente busca a versão fresca em no máximo 15 segundos ou sob revalidação automática ao adicionar itens ao carrinho.
                      </p>
                    </div>

                    <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
                      <p className="font-bold text-neutral-900">3. Princípio do Snapshot Imutável de Pedidos</p>
                      <p className="mt-1">
                        Quando um cliente fecha um pedido de um Smash Burger a R$ 34,90, o sistema grava uma cópia física exata de todos os itens na tabela <code className="bg-neutral-200 px-1 py-0.2 rounded font-mono text-[11px]">order_items</code>. Se amanhã o dono aumentar o prato para R$ 42,00, a tabela de produtos muda, mas o pedido passado mantém R$ 34,90 intactos.
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-end pt-3 border-t border-neutral-200 text-xs">
                    <button
                      type="button"
                      onClick={() => setShowHowItWorksModal(false)}
                      className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white font-semibold rounded-lg shadow-xs"
                    >
                      Fechar Explicação
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 2: CATEGORIES & OPTION GROUPS                              */}
        {/* ============================================================== */}
        {activeTab === 'categories' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-6 bg-white border border-neutral-200 rounded-lg p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-neutral-200">
                <div>
                  <h3 className="text-sm font-bold text-neutral-900">Categorias do Cardápio</h3>
                  <p className="text-xs text-neutral-500">Organize como os itens aparecem no cardápio web ou exporte/importe por planilha.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsImportMenuModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-neutral-800 bg-neutral-100 hover:bg-neutral-200 border border-neutral-200 rounded-lg transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5 text-neutral-600" />
                    <span>Importar Cardápio</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSpreadsheetModalTab('export')}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Exportar (.CSV)</span>
                  </button>
                  <button
                    onClick={() => setIsCategoryModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Nova Categoria</span>
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {categories.map((cat, idx) => (
                  <div
                    key={cat.id}
                    className="p-3 border border-neutral-200 rounded-lg flex items-center justify-between text-xs hover:border-neutral-300 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-neutral-400 font-bold">{idx + 1}</span>
                      <span className="font-semibold text-neutral-900">{cat.name}</span>
                    </div>
                    <span className="text-[11px] text-neutral-500 font-mono">
                      {products.filter((p) => p.categoryId === cat.id).length} itens
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-6 bg-white border border-neutral-200 rounded-lg p-5 space-y-4">
              <div className="pb-3 border-b border-neutral-200">
                <h3 className="text-sm font-bold text-neutral-900">Como Atualizar Adicionais &amp; Variações</h3>
                <p className="text-xs text-neutral-500">
                  Os adicionais são associados aos produtos (ex: &quot;Ponto da Carne&quot;, &quot;Molho Extra&quot;, &quot;Borda Recheada&quot;).
                </p>
              </div>

              <div className="p-4 bg-neutral-50 rounded-lg text-xs space-y-2 text-neutral-700 leading-relaxed border border-neutral-200">
                <p className="font-semibold text-neutral-900">Regras de negócio suportadas:</p>
                <p>&bull; <strong>Seleção Obrigatória (Ex: Ponto da Carne):</strong> Mínimo 1, Máximo 1.</p>
                <p>&bull; <strong>Adicionais Pagos Opcionais (Ex: Fatias de Bacon):</strong> Mínimo 0, Máximo 3 com valor unitário adicional em centavos.</p>
                <p>&bull; <strong>Recálculo no Servidor:</strong> O carrinho valida rigorosamente cada adicional no backend para evitar adulteração de preço.</p>
              </div>

              <button
                onClick={handleOpenAddProduct}
                className="w-full py-2.5 px-3 text-xs font-semibold text-neutral-800 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <span>Criar Prato com Grupos de Adicionais</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 3: SETTINGS & BRAND IDENTITY                               */}
        {/* ============================================================== */}
        {activeTab === 'settings' && (
          <div className="max-w-3xl bg-white border border-neutral-200 rounded-lg p-6 space-y-6">
            <div>
              <h3 className="text-sm font-bold text-neutral-900">Configurações Gerais do Restaurante</h3>
              <p className="text-xs text-neutral-500">
                Altere dados cadastrais, horários de atendimento, taxa de entrega padrão e a cor da sua marca.
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

            {/* PIX GATEWAY & WEBHOOK AUTOMATION CARD (Passo 2) */}
            <div className="bg-gradient-to-br from-emerald-50 via-white to-neutral-50 border border-emerald-200 rounded-xl p-5 shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-emerald-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs shrink-0">
                    <Zap className="w-4 h-4 fill-current" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-neutral-900 flex items-center gap-1.5">
                      <span>Chave Pix Direta do Restaurante &amp; QR Code Oficial (Passo 2)</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-200">
                        100% Direto na Conta da Loja · 0% Comissão
                      </span>
                    </h4>
                    <p className="text-xs text-neutral-500">
                      Cada cliente paga o Pix diretamente na conta bancária do seu restaurante. A Aladay não intermedeia suas vendas (o Asaas é usado apenas na assinatura de R$ 129,90/mês).
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
                      if (authSession?.token) {
                        headers['Authorization'] = `Bearer ${authSession.token}`;
                      }
                      const res = await fetch('/api/v1/pix/simulate-payment', {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({ orderId: orders[0]?.id || 'ord_1042' }),
                      });
                      if (res.ok) {
                        setStatusUpdateToast(
                          `⚡ Pagamento Pix Direto confirmado! Pedido #${orders[0]?.orderNumber || 1042} aprovado e enviado para a cozinha!`
                        );
                        setTimeout(() => setStatusUpdateToast(null), 6000);
                      }
                    } catch (e) {
                      console.error(e);
                    }
                  }}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-xs transition-colors shrink-0"
                >
                  <Zap className="w-3.5 h-3.5 fill-current" />
                  <span>Simular Pagamento do Cliente (R$ 85,80)</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                {/* 1: Conta Bancária de Destino */}
                <div className="p-3 bg-white border border-neutral-200 rounded-lg space-y-1">
                  <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider block">Destino dos Pedidos</span>
                  <p className="font-bold text-neutral-900 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{tenant.pixConfig?.bankName || 'Conta Bancária da Loja'}</span>
                    <span className="text-[10px] text-emerald-700 font-semibold">· 100% Direto</span>
                  </p>
                </div>

                {/* 2: Chave Pix da Loja (Editável por cada restaurante) */}
                <div
                  className={`p-3 bg-white border rounded-lg space-y-2 transition-all ${
                    isEditingPixKey
                      ? 'md:col-span-3 border-emerald-400 ring-2 ring-emerald-500/10 shadow-sm'
                      : 'border-neutral-200 hover:border-emerald-300'
                  }`}
                >
                  {!isEditingPixKey ? (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider block">
                          Chave Pix da Loja
                        </span>
                        <button
                          type="button"
                          onClick={() => setIsEditingPixKey(true)}
                          className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded transition-colors flex items-center gap-1 cursor-pointer"
                          title="Editar chave Pix deste restaurante"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span>Editar Chave</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono">
                          {tenant.pixConfig?.pixKeyType || 'telefone'}
                        </span>
                        <p className="font-mono font-bold text-neutral-900 text-xs truncate">
                          {tenant.pixConfig?.pixKey || tenant.phone || '+5511987654321'}
                        </p>
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-neutral-500 pt-1 border-t border-neutral-100">
                        <span className="truncate">
                          Titular:{' '}
                          <strong className="text-neutral-700">
                            {tenant.pixConfig?.merchantName || tenant.name}
                          </strong>{' '}
                          · {tenant.pixConfig?.merchantCity || 'SAO PAULO'}
                        </span>
                        <span className="text-emerald-700 font-medium shrink-0 flex items-center gap-0.5">
                          <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                          BACEN EMV
                        </span>
                      </div>
                    </>
                  ) : (
                    <form onSubmit={handleSavePixConfig} className="space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-emerald-100">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="font-bold text-neutral-900 text-xs">
                            Configurar Chave Pix Direta &amp; Conta Bancária de {tenant.name}
                          </span>
                        </div>
                        <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded">
                          100% Direto na Sua Conta
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 text-xs">
                        <div>
                          <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                            Tipo de Chave
                          </label>
                          <select
                            value={pixKeyType}
                            onChange={(e) => setPixKeyType(e.target.value as any)}
                            className="w-full p-2 bg-neutral-50 border border-neutral-300 rounded text-xs text-neutral-900 font-medium focus:bg-white focus:border-emerald-500 outline-none"
                          >
                            <option value="phone">Celular / Telefone (+55)</option>
                            <option value="cnpj">CNPJ (Pessoa Jurídica)</option>
                            <option value="email">E-mail</option>
                            <option value="cpf">CPF (Pessoa Física)</option>
                            <option value="random">Chave Aleatória (EVP)</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                            Chave Pix do Restaurante
                          </label>
                          <input
                            type="text"
                            required
                            placeholder={
                              pixKeyType === 'cnpj'
                                ? '12.345.678/0001-90'
                                : pixKeyType === 'email'
                                ? 'financeiro@restaurante.com.br'
                                : pixKeyType === 'cpf'
                                ? '123.456.789-00'
                                : pixKeyType === 'random'
                                ? '123e4567-e89b-12d3-a456-426614174000'
                                : '+55 11 98765-4321'
                            }
                            value={pixKey}
                            onChange={(e) => setPixKey(e.target.value)}
                            className="w-full p-2 bg-neutral-50 border border-neutral-300 rounded text-xs text-neutral-900 font-mono focus:bg-white focus:border-emerald-500 outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                            Titular da Conta (máx. 25 car.)
                          </label>
                          <input
                            type="text"
                            required
                            maxLength={25}
                            placeholder="Nome / Razão Social"
                            value={pixMerchantName}
                            onChange={(e) => setPixMerchantName(e.target.value)}
                            className="w-full p-2 bg-neutral-50 border border-neutral-300 rounded text-xs text-neutral-900 font-medium focus:bg-white focus:border-emerald-500 outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                            Cidade da Conta (máx. 15 car.)
                          </label>
                          <input
                            type="text"
                            required
                            maxLength={15}
                            placeholder="SAO PAULO"
                            value={pixMerchantCity}
                            onChange={(e) => setPixMerchantCity(e.target.value.toUpperCase())}
                            className="w-full p-2 bg-neutral-50 border border-neutral-300 rounded text-xs text-neutral-900 font-medium uppercase focus:bg-white focus:border-emerald-500 outline-none"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 text-xs">
                        <div>
                          <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                            Instituição Bancária da Loja (Apenas Identificação)
                          </label>
                          <input
                            type="text"
                            placeholder="Ex: Nubank PJ, Banco Inter, Itaú Empresas, Sicredi..."
                            value={pixBankName}
                            onChange={(e) => setPixBankName(e.target.value)}
                            className="w-full p-2 bg-neutral-50 border border-neutral-300 rounded text-xs text-neutral-900 font-medium focus:bg-white focus:border-emerald-500 outline-none"
                          />
                        </div>

                        <div className="flex items-center gap-2 pt-4">
                          <label className="flex items-center gap-2 cursor-pointer text-[11px] text-neutral-700 font-medium">
                            <input
                              type="checkbox"
                              checked={true}
                              readOnly
                              className="w-4 h-4 text-emerald-600 rounded accent-emerald-600"
                            />
                            <span>O pagamento do cliente cai 100% direto na conta deste restaurante</span>
                          </label>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-neutral-200">
                        <span className="text-[10px] text-neutral-500">
                          Ao salvar, os QR Codes de pedidos dos clientes apontarão direto para esta chave.
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setIsEditingPixKey(false);
                              setPixKey(tenant.pixConfig?.pixKey || tenant.phone || '5511987654321');
                            }}
                            className="px-3 py-1.5 text-xs font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded transition-colors"
                          >
                            Cancelar
                          </button>
                          <button
                            type="submit"
                            disabled={pixSaving}
                            className="px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                          >
                            {pixSaving ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                            <span>{pixSaving ? 'Salvando...' : 'Salvar Chave Pix'}</span>
                          </button>
                        </div>
                      </div>
                    </form>
                  )}
                </div>

                {/* 3: Aprovação no KDS */}
                <div className="p-3 bg-white border border-neutral-200 rounded-lg space-y-1">
                  <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider block">Aprovação no KDS</span>
                  <p className="font-bold text-emerald-700 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-emerald-600" />
                    Instantânea (Move para Cozinha)
                  </p>
                </div>
              </div>

              {/* DIRECT PIX MODEL & CLOUDFLARE DOMAIN INTEGRATION */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                {/* Direct Pix Explanation */}
                <div className="p-3.5 bg-white border border-neutral-200 rounded-lg space-y-1.5">
                  <div className="flex items-center justify-between font-semibold text-neutral-800">
                    <span className="flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-emerald-600 fill-current" />
                      Modelo de Recebimento Direto (Cliente &rarr; Restaurante)
                    </span>
                    <span className="text-[10px] text-emerald-700 font-mono bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                      0% Taxa Aladay
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-500">
                    O QR Code Pix gerado no checkout do cardápio usa o padrão EMV do Banco Central com a chave acima. O dinheiro vai direto do banco do cliente para o banco do restaurante, sem passar pelo Asaas.
                  </p>
                  <div className="flex items-center justify-between pt-1 border-t border-neutral-100 text-[11px]">
                    <span className="text-neutral-500">Assinatura Mensal da Plataforma (R$ 129,90):</span>
                    <button
                      type="button"
                      onClick={() => setActiveTab('billing')}
                      className="text-emerald-700 hover:text-emerald-900 font-bold underline cursor-pointer"
                    >
                      Gerenciada via Asaas na aba Assinatura &rarr;
                    </button>
                  </div>
                </div>

                {/* Cloudflare DNS & Proxy Box */}
                <div className="p-3.5 bg-white border border-neutral-200 rounded-lg space-y-1.5">
                  <div className="flex items-center justify-between font-semibold text-neutral-800">
                    <span className="flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                      Domínio Oficial &amp; Cloudflare
                    </span>
                    <span className="text-[10px] text-blue-800 font-bold bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      aladay.com.br
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-500">
                    Apontamento DNS com Nuvem Laranja ativa (Proxy, WAF, SSL Full Strict e WebSockets KDS).
                  </p>
                  <div className="flex items-center justify-between pt-1 border-t border-neutral-100 text-[11px] font-mono">
                    <span className="text-neutral-600">Cardápio Público do Restaurante:</span>
                    <span className="text-emerald-700 font-bold">
                      https://aladay.com.br/{tenant.slug}
                    </span>
                  </div>
                </div>
              </div>
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

            {/* Explanatory Header */}
            <div className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
              <div>
                <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                  <LayoutGrid className="w-4 h-4 text-orange-600" />
                  <span>Quadro KDS em Tempo Real com Notificação WhatsApp</span>
                </h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Ao avançar o status no Kanban, o sistema dispara automaticamente uma mensagem formatada para o WhatsApp do cliente via Evolution API (instância <code className="font-mono text-neutral-800 font-bold">{tenant.evolutionInstanceId || 'aladay'}</code>).
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
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
                  {ordersByStatus.received.map((order) => (
                    <div
                      key={order.id}
                      className="border border-amber-300 bg-amber-50/40 rounded-xl p-3 space-y-2 shadow-2xs hover:border-amber-400 transition-colors"
                    >
                      <div className="flex justify-between items-start">
                        <span className="text-xs font-mono font-bold text-neutral-900">
                          #{order.orderNumber}
                        </span>
                        <span className="text-[10px] text-neutral-500 font-mono">{order.createdAt}</span>
                      </div>

                      <div>
                        <p className="text-xs font-bold text-neutral-900">{order.customerName}</p>
                        <p className="text-[11px] text-neutral-600 font-mono">+{order.customerPhone}</p>
                        <p className="text-[11px] text-neutral-600 mt-0.5">
                          {order.type === 'delivery' ? '🛵 Entrega' : '🛍️ Retirada'} · {order.items.length} itens
                        </p>
                      </div>

                      <div className="flex justify-between items-center text-xs font-mono font-bold text-neutral-900 pt-1">
                        <span>{formatBRL(order.totalCents)}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex items-center gap-1 ${
                          order.paymentStatus === 'paid_online'
                            ? 'bg-emerald-100 text-emerald-800 font-bold border border-emerald-200'
                            : 'bg-amber-100 text-amber-900'
                        }`}>
                          {order.paymentStatus === 'paid_online' && <Zap className="w-2.5 h-2.5 text-emerald-600 fill-current" />}
                          {order.paymentStatus === 'paid_online' ? '⚡ Pix Pago Online' : order.paymentMethod}
                        </span>
                      </div>

                      {/* Card Action Buttons */}
                      <div className="pt-2 border-t border-amber-200 flex flex-col gap-1.5">
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
                  ))}
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
                  {[...ordersByStatus.confirmed, ...ordersByStatus.preparing].map((order) => (
                    <div
                      key={order.id}
                      className="border border-neutral-200 bg-white rounded-xl p-3 space-y-2 shadow-2xs hover:border-neutral-300 transition-colors"
                    >
                      <div className="flex justify-between items-start">
                        <span className="text-xs font-mono font-bold text-neutral-900">
                          #{order.orderNumber}
                        </span>
                        <span className="text-[10px] text-neutral-500 font-mono">{order.createdAt}</span>
                      </div>

                      <div>
                        <p className="text-xs font-bold text-neutral-900">{order.customerName}</p>
                        <div className="text-[11px] text-neutral-600 mt-1 space-y-0.5">
                          {order.items.map((i, idx) => (
                            <p key={idx} className="truncate">
                              • {i.quantity}x {i.productName}
                            </p>
                          ))}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-neutral-100 flex flex-col gap-1.5">
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
                            className="flex-1 py-1 px-1.5 text-[10px] font-medium text-neutral-700 bg-neutral-50 hover:bg-neutral-100 rounded flex items-center justify-center gap-1 border border-neutral-200"
                          >
                            <Clock className="w-3 h-3 text-blue-600" />
                            <span>Rastrear (Cliente)</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setPrintingOrder(order)}
                            className="p-1 text-neutral-600 bg-neutral-50 hover:bg-neutral-100 rounded border border-neutral-200"
                            title="Imprimir comanda térmica"
                          >
                            <Printer className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
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
                  {ordersByStatus.ready.map((order) => (
                    <div
                      key={order.id}
                      className="border border-purple-200 bg-purple-50/20 rounded-xl p-3 space-y-2 shadow-2xs hover:border-purple-300 transition-colors"
                    >
                      <div className="flex justify-between items-start">
                        <span className="text-xs font-mono font-bold text-neutral-900">
                          #{order.orderNumber}
                        </span>
                        <span className="text-[10px] text-neutral-500 font-mono">{order.createdAt}</span>
                      </div>

                      <div>
                        <p className="text-xs font-bold text-neutral-900">{order.customerName}</p>
                        <p className="text-[11px] text-neutral-600">
                          {order.type === 'delivery' ? `🛵 ${order.deliveryAddress || 'Entrega'}` : '🛍️ Retirada no balcão'}
                        </p>
                      </div>

                      <div className="pt-2 border-t border-purple-100 flex flex-col gap-1.5">
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
                  ))}
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
                  {ordersByStatus.delivered.map((order) => (
                    <div
                      key={order.id}
                      className="border border-neutral-200 bg-neutral-50 rounded-xl p-2.5 text-xs text-neutral-600 space-y-1.5 hover:border-neutral-300 transition-colors"
                    >
                      <div className="flex justify-between items-center font-mono">
                        <span className="font-bold text-neutral-900">#{order.orderNumber}</span>
                        <span className="tabular-nums font-semibold">{formatBRL(order.totalCents)}</span>
                      </div>
                      <p className="text-[11px] truncate font-medium text-neutral-800">{order.customerName}</p>

                      <div className="flex gap-1 pt-1 border-t border-neutral-200">
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
                  ))}
                  {ordersByStatus.delivered.length === 0 && (
                    <p className="text-xs text-neutral-400 text-center pt-10">Nenhum pedido finalizado ainda.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 5: WHATSAPP EVOLUTION API                                  */}
        {/* ============================================================== */}
        {activeTab === 'whatsapp' && (
          <WhatsAppAutomationView
            tenant={tenant}
            orders={orders}
            onUpdateTenant={onUpdateTenant}
            onSimulateEvolutionReconnect={onSimulateEvolutionReconnect}
            authSession={authSession}
          />
        )}

        {/* ============================================================== */}
        {/* TAB 6: CRM & CLIENTES ISOLADOS COM HISTÓRICO DE PEDIDOS        */}
        {/* ============================================================== */}
        {activeTab === 'crm' && (
          <CrmCustomerManagementView
            tenant={tenant}
            orders={orders}
            customers={customers}
            onPrintOrder={(order) => setPrintingOrder(order)}
          />
        )}

        {/* ============================================================== */}
        {/* TAB 7: DASHBOARD GERENCIAL COM FÓRMULAS AUDITADAS              */}
        {/* ============================================================== */}
        {activeTab === 'reports' && (
          <AuditedDashboardView
            tenant={tenant}
            orders={orders}
            onNavigateToTab={(tab) => {
              if (tab === 'crm') setActiveTab('crm');
              if (tab === 'kds') setActiveTab('kds');
              if (tab === 'menu') setActiveTab('menu');
            }}
            onPrintOrder={(order) => setPrintingOrder(order)}
          />
        )}

        {/* ============================================================== */}
        {/* TAB 8: BILLING & SUBSCRIPTION (R$ 129,90/mês via Asaas)       */}
        {/* ============================================================== */}
        {activeTab === 'billing' && (
          <AsaasSubscriptionBillingView tenant={tenant} onUpdateTenant={onUpdateTenant} />
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

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">URL da Imagem do Prato</label>
                <input
                  type="text"
                  placeholder="https://... ou caminho de imagem"
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
                  <input
                    ref={importFileInputRef}
                    type="file"
                    accept=".csv,.tsv,.txt"
                    onChange={handleImportFileUpload}
                    className="hidden"
                  />

                  <div className="flex items-center gap-3.5 text-center sm:text-left">
                    <div className="w-11 h-11 rounded-xl bg-white border border-neutral-200 flex items-center justify-center text-neutral-700 shadow-2xs shrink-0">
                      <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-neutral-900">
                        Selecione a planilha do seu computador ou arraste o arquivo aqui
                      </p>
                      <p className="text-[11px] text-neutral-500 mt-0.5">
                        Formatos aceitos: <strong>.CSV</strong>, <strong>.TSV</strong> ou <strong>.TXT</strong> (separados por ponto e vírgula <code className="bg-neutral-200 px-1 rounded">;</code> ou vírgula <code className="bg-neutral-200 px-1 rounded">,</code>)
                      </p>
                      {importFileName && (
                        <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-900">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Arquivo carregado: {importFileName}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => importFileInputRef.current?.click()}
                      className="flex items-center gap-2 px-4 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold rounded-lg transition-colors shadow-xs"
                    >
                      <Upload className="w-4 h-4" />
                      <span>Upload de Arquivo</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleLoadSampleImportTable}
                      className="px-3 py-2.5 bg-white hover:bg-neutral-100 text-neutral-700 border border-neutral-300 text-xs font-semibold rounded-lg transition-colors"
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
