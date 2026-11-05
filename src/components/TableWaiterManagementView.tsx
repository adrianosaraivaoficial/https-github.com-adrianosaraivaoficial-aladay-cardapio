import React, { useState, useMemo, useEffect } from 'react';
import {
  Utensils,
  Plus,
  Minus,
  Check,
  QrCode,
  Printer,
  Users,
  Search,
  Clock,
  CheckCircle2,
  Sparkles,
  Copy,
  Trash2,
  Receipt,
  CreditCard,
  BellRing,
  ChefHat,
  ExternalLink,
} from 'lucide-react';
import QRCode from 'qrcode';
import {
  Category,
  Order,
  OrderItem,
  OrderStatus,
  Product,
  RestaurantTenant,
} from '../types';

interface TableWaiterManagementViewProps {
  tenant: RestaurantTenant;
  categories: Category[];
  products: Product[];
  orders: Order[];
  onAddOrder: (newOrder: Order) => void;
  onUpdateOrderStatus: (orderId: string, nextStatus: OrderStatus) => void;
  onUpdateTenant: (updated: RestaurantTenant) => void;
  onPrintOrder?: (order: Order) => void;
}

type TableStatusFilter = 'all' | 'occupied' | 'ready' | 'bill_requested' | 'free';

const DEFAULT_WAITERS = [
  'Garçom Carlos',
  'Garçonete Juliana',
  'Garçom Marcos',
  'Atendimento Balcão',
];

export const TableWaiterManagementView: React.FC<TableWaiterManagementViewProps> = ({
  tenant,
  categories,
  products,
  orders,
  onAddOrder,
  onUpdateOrderStatus,
  onUpdateTenant,
  onPrintOrder,
}) => {
  const totalTables = tenant.tablesCount || 12;
  const [selectedTableNumber, setSelectedTableNumber] = useState<string>('01');
  const [tableFilter, setTableFilter] = useState<TableStatusFilter>('all');
  const [rightPanelTab, setRightPanelTab] = useState<'launch' | 'bill' | 'qrcode'>('launch');

  // Table states tracked locally for "Pediu a Conta" or "Servido"
  const [tablesRequestingBill, setTablesRequestingBill] = useState<Record<string, boolean>>({});
  const [servedOrderIds, setServedOrderIds] = useState<Record<string, boolean>>({});

  // Waiter Order Launch State
  const [selectedWaiter, setSelectedWaiter] = useState<string>(DEFAULT_WAITERS[0]);
  const [tableCustomerName, setTableCustomerName] = useState<string>('');
  const [productSearch, setProductSearch] = useState<string>('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [waiterCart, setWaiterCart] = useState<
    Array<{ product: Product; quantity: number; notes: string }>
  >([]);

  // Bill Closing & Split State
  const [includeServiceFee, setIncludeServiceFee] = useState<boolean>(true);
  const [splitPeopleCount, setSplitPeopleCount] = useState<number>(2);
  const [closingPaymentMethod, setClosingPaymentMethod] = useState<string>(
    'Pix Direto na Conta da Loja'
  );
  const [actionToast, setActionToast] = useState<string | null>(null);

  // QR Code for Selected Table
  const [tableQrDataUrl, setTableQrDataUrl] = useState<string>('');
  const [qrLinkCopied, setQrLinkCopied] = useState<boolean>(false);

  const formatBRL = (cents: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);

  const showNotice = (msg: string) => {
    setActionToast(msg);
    setTimeout(() => setActionToast(null), 4500);
  };

  // Build list of table numbers ("01", "02", ..., "12")
  const tableNumbers = useMemo(() => {
    return Array.from({ length: totalTables }, (_, idx) =>
      String(idx + 1).padStart(2, '0')
    );
  }, [totalTables]);

  // Active dine-in orders (not yet closed/delivered and not cancelled)
  const activeDineInOrdersByTable = useMemo(() => {
    const map: Record<string, Order[]> = {};
    tableNumbers.forEach((num) => {
      map[num] = [];
    });

    orders.forEach((order) => {
      if (order.status === 'cancelled' || order.status === 'delivered') return;
      const rawTable =
        order.tableNumber ||
        (order.deliveryAddress?.toLowerCase().includes('mesa')
          ? order.deliveryAddress.replace(/\D/g, '')
          : '');
      if (order.type === 'dine_in' || rawTable) {
        const normalizedNum = String(parseInt(rawTable || '1', 10) || 1).padStart(2, '0');
        if (!map[normalizedNum]) map[normalizedNum] = [];
        map[normalizedNum].push(order);
      }
    });

    return map;
  }, [orders, tableNumbers]);

  // Compute rich status for each table
  const tablesOverview = useMemo(() => {
    return tableNumbers.map((num) => {
      const tableOrders = activeDineInOrdersByTable[num] || [];
      const isOccupied = tableOrders.length > 0;
      const hasReadyToServe = tableOrders.some(
        (o) => o.status === 'ready' && !servedOrderIds[o.id]
      );
      const isBillRequested = isOccupied && Boolean(tablesRequestingBill[num]);
      const subtotalCents = tableOrders.reduce((sum, o) => sum + (o.subtotalCents || o.totalCents || 0), 0);
      const totalItemsCount = tableOrders.reduce(
        (sum, o) => sum + (o.items || []).reduce((s, i) => s + i.quantity, 0),
        0
      );
      const lastWaiter =
        tableOrders.find((o) => o.waiterName)?.waiterName ||
        (isOccupied ? 'QR Code da Mesa' : undefined);
      const firstOrderTime = tableOrders[tableOrders.length - 1]?.createdAt;

      let status: 'free' | 'occupied' | 'ready' | 'bill_requested' = 'free';
      if (hasReadyToServe) {
        status = 'ready';
      } else if (isBillRequested) {
        status = 'bill_requested';
      } else if (isOccupied) {
        status = 'occupied';
      }

      return {
        number: num,
        status,
        orders: tableOrders,
        subtotalCents,
        totalItemsCount,
        lastWaiter,
        firstOrderTime,
      };
    });
  }, [tableNumbers, activeDineInOrdersByTable, servedOrderIds, tablesRequestingBill]);

  const filteredTables = useMemo(() => {
    if (tableFilter === 'all') return tablesOverview;
    return tablesOverview.filter((t) => t.status === tableFilter);
  }, [tablesOverview, tableFilter]);

  const currentTableData = useMemo(() => {
    return (
      tablesOverview.find((t) => t.number === selectedTableNumber) ||
      tablesOverview[0]
    );
  }, [tablesOverview, selectedTableNumber]);

  // Table QR Code URL
  const selectedTableMenuUrl = useMemo(() => {
    const base =
      typeof window !== 'undefined'
        ? `${window.location.origin}${window.location.pathname}`
        : `https://aladay.com.br/`;
    return `${base}?loja=${encodeURIComponent(tenant.slug)}&mesa=${encodeURIComponent(
      selectedTableNumber
    )}`;
  }, [tenant.slug, selectedTableNumber]);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(selectedTableMenuUrl, { width: 220, margin: 1 })
      .then((url) => {
        if (active) setTableQrDataUrl(url);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [selectedTableMenuUrl]);

  // Filtered products for Waiter POS
  const availableProducts = useMemo(() => {
    return products.filter((p) => {
      if (!p.isAvailable) return false;
      const matchesCat =
        selectedCategoryId === 'all' || p.categoryId === selectedCategoryId;
      const matchesQuery =
        !productSearch.trim() ||
        p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
        p.description.toLowerCase().includes(productSearch.toLowerCase());
      return matchesCat && matchesQuery;
    });
  }, [products, selectedCategoryId, productSearch]);

  const handleAddToWaiterCart = (product: Product) => {
    setWaiterCart((prev) => {
      const idx = prev.findIndex((item) => item.product.id === product.id);
      if (idx >= 0) {
        const clone = [...prev];
        clone[idx] = { ...clone[idx], quantity: clone[idx].quantity + 1 };
        return clone;
      }
      return [...prev, { product, quantity: 1, notes: '' }];
    });
  };

  const handleChangeWaiterCartQty = (productId: string, delta: number) => {
    setWaiterCart((prev) =>
      prev
        .map((item) =>
          item.product.id === productId
            ? { ...item, quantity: item.quantity + delta }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const handleUpdateWaiterItemNote = (productId: string, notes: string) => {
    setWaiterCart((prev) =>
      prev.map((item) =>
        item.product.id === productId ? { ...item, notes } : item
      )
    );
  };

  const waiterCartSubtotalCents = useMemo(() => {
    return waiterCart.reduce(
      (sum, item) => sum + item.product.priceCents * item.quantity,
      0
    );
  }, [waiterCart]);

  // Submit Waiter Order directly to Kitchen (KDS) & Table Tab
  const handleLaunchWaiterOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (waiterCart.length === 0) return;

    const nowStr = new Date().toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const orderNumber = Math.floor(2000 + Math.random() * 7900);

    const items: OrderItem[] = waiterCart.map((entry) => ({
      productId: entry.product.id,
      productName: entry.product.name,
      unitPriceCents: entry.product.priceCents,
      quantity: entry.quantity,
      selectedOptions: [],
      notes: entry.notes.trim() || undefined,
      totalCents: entry.product.priceCents * entry.quantity,
    }));

    const newOrder: Order = {
      id: `ord_mesa_${Date.now()}`,
      orderNumber,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      customerName: tableCustomerName.trim()
        ? `${tableCustomerName.trim()} (Mesa ${selectedTableNumber})`
        : `Mesa ${selectedTableNumber}`,
      customerPhone: tenant.phone || '5511999999999',
      type: 'dine_in',
      tableNumber: selectedTableNumber,
      waiterName: selectedWaiter,
      deliveryAddress: `Consumo no Salão · Mesa ${selectedTableNumber}`,
      items,
      subtotalCents: waiterCartSubtotalCents,
      deliveryFeeCents: 0,
      totalCents: waiterCartSubtotalCents,
      status: 'confirmed',
      paymentStatus: 'pending',
      paymentMethod: 'Comanda Aberta da Mesa',
      whatsAppStatus: 'sent',
      channel: 'DIRECT',
      whatsAppLogs: [
        {
          timestamp: nowStr,
          event: 'WAITER_TABLE_ORDER',
          detail: `Pedido #${orderNumber} lançado na Mesa ${selectedTableNumber} por ${selectedWaiter} e enviado direto para a Cozinha (KDS).`,
        },
      ],
      createdAt: nowStr,
      updatedAt: nowStr,
    };

    onAddOrder(newOrder);
    setWaiterCart([]);
    setRightPanelTab('bill');
    showNotice(
      `🍽️ Pedido #${orderNumber} lançado na Mesa ${selectedTableNumber} (${selectedWaiter}) e enviado para a Cozinha (KDS)!`
    );
  };

  // Mark a "ready" order from KDS as served at the table by the waiter
  const handleMarkDishServedAtTable = (orderId: string, orderNum: number) => {
    setServedOrderIds((prev) => ({ ...prev, [orderId]: true }));
    showNotice(
      `✅ Pedido #${orderNum} marcado como servido na Mesa ${selectedTableNumber}!`
    );
  };

  // Close & settle all active orders for the selected table
  const handleCloseTableAccount = () => {
    if (!currentTableData || currentTableData.orders.length === 0) return;

    currentTableData.orders.forEach((order) => {
      onUpdateOrderStatus(order.id, 'delivered');
    });

    setTablesRequestingBill((prev) => {
      const next = { ...prev };
      delete next[selectedTableNumber];
      return next;
    });

    showNotice(
      `🎉 Conta da Mesa ${selectedTableNumber} encerrada via "${closingPaymentMethod}"! A Mesa ${selectedTableNumber} já está Livre e os valores entraram nos Relatórios.`
    );
  };

  // Aggregated bill calculations for currentTableData
  const billCalculations = useMemo(() => {
    const subtotalCents = currentTableData?.subtotalCents || 0;
    const serviceFeeCents = includeServiceFee ? Math.round(subtotalCents * 0.1) : 0;
    const grandTotalCents = subtotalCents + serviceFeeCents;
    const perPersonCents =
      splitPeopleCount > 0 ? Math.ceil(grandTotalCents / splitPeopleCount) : grandTotalCents;

    const allItems: Array<{
      orderNumber: number;
      orderStatus: OrderStatus;
      orderId: string;
      waiterOrSource: string;
      createdAt: string;
      item: OrderItem;
    }> = [];

    (currentTableData?.orders || []).forEach((order) => {
      (order.items || []).forEach((item) => {
        allItems.push({
          orderNumber: order.orderNumber,
          orderStatus: order.status,
          orderId: order.id,
          waiterOrSource: order.waiterName || 'QR Code Cliente',
          createdAt: order.createdAt,
          item,
        });
      });
    });

    return {
      subtotalCents,
      serviceFeeCents,
      grandTotalCents,
      perPersonCents,
      allItems,
    };
  }, [currentTableData, includeServiceFee, splitPeopleCount]);

  // Summary counts
  const occupiedCount = tablesOverview.filter((t) => t.status !== 'free').length;
  const readyToServeCount = tablesOverview.filter((t) => t.status === 'ready').length;
  const billRequestedCount = tablesOverview.filter(
    (t) => t.status === 'bill_requested'
  ).length;
  const totalOpenSaloonCents = tablesOverview.reduce(
    (sum, t) => sum + t.subtotalCents,
    0
  );

  return (
    <div className="space-y-6">
      {/* Top Header & Saloon KPI Strip */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Utensils className="w-5 h-5 text-blue-600" />
              <h2 className="text-base font-bold text-slate-900">
                Controle de Mesas, Comanda Digital &amp; App do Garçom
              </h2>
              <span className="text-xs text-slate-500">
                · QR Code por Mesa + Lançamento Rápido no Salão
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Os pedidos feitos pelo celular do cliente (via QR Code da mesa) e os lançados pelo garçom caem juntos na mesma comanda da mesa e vão direto para o KDS da cozinha.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <span className="text-xs text-slate-600 font-medium">Total de Mesas no Salão:</span>
            <select
              value={totalTables}
              onChange={(e) =>
                onUpdateTenant({
                  ...tenant,
                  tablesCount: Number(e.target.value) || 12,
                })
              }
              className="p-2 text-xs font-semibold border border-slate-300 rounded-lg bg-slate-50 text-slate-900"
            >
              <option value={8}>8 Mesas</option>
              <option value={12}>12 Mesas</option>
              <option value={16}>16 Mesas</option>
              <option value={20}>20 Mesas</option>
              <option value={24}>24 Mesas</option>
            </select>
          </div>
        </div>

        {/* 4 Saloon Real-Time Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
            <span className="text-[11px] font-medium text-slate-500 block">
              Mesas Ocupadas / Total
            </span>
            <p className="text-xl font-bold font-mono text-slate-900 tabular-nums mt-0.5">
              {occupiedCount} / {totalTables}
            </p>
          </div>

          <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl">
            <span className="text-[11px] font-semibold text-amber-800 block">
              Pratos Prontos p/ Servir
            </span>
            <p className="text-xl font-bold font-mono text-amber-900 tabular-nums mt-0.5">
              {readyToServeCount} {readyToServeCount === 1 ? 'mesa' : 'mesas'}
            </p>
          </div>

          <div className="p-3 bg-purple-50/70 border border-purple-200 rounded-xl">
            <span className="text-[11px] font-semibold text-purple-800 block">
              Pedindo a Conta
            </span>
            <p className="text-xl font-bold font-mono text-purple-900 tabular-nums mt-0.5">
              {billRequestedCount} {billRequestedCount === 1 ? 'mesa' : 'mesas'}
            </p>
          </div>

          <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl">
            <span className="text-[11px] font-semibold text-emerald-800 block">
              Consumo Aberto no Salão
            </span>
            <p className="text-xl font-bold font-mono text-emerald-800 tabular-nums mt-0.5">
              {formatBRL(totalOpenSaloonCents)}
            </p>
          </div>
        </div>
      </div>

      {/* Live Toast Notice */}
      {actionToast && (
        <div className="p-3.5 bg-slate-900 text-white rounded-xl border border-slate-700 text-xs font-medium flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{actionToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionToast(null)}
            className="text-slate-400 hover:text-white text-xs"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Main Split Workspace: Left 7 Cols = Interactive Table Map | Right 5 Cols = Active Table Control */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN (7 Cols): MAPA DE MESAS DO SALÃO */}
        <div className="xl:col-span-7 bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Mapa de Mesas em Tempo Real
              </h3>
              <p className="text-[11px] text-slate-500">
                Toque em uma mesa para lançar produtos, conferir pedidos ou fechar a conta
              </p>
            </div>

            {/* Interactive Filter Controls */}
            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg text-[11px]">
              {(
                [
                  { id: 'all', label: 'Todas' },
                  { id: 'occupied', label: 'Ocupadas' },
                  { id: 'ready', label: 'Servir Agora' },
                  { id: 'bill_requested', label: 'Pediu Conta' },
                  { id: 'free', label: 'Livres' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setTableFilter(tab.id)}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    tableFilter === tab.id
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Grid of Table Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {filteredTables.map((table) => {
              const isSelected = table.number === selectedTableNumber;

              let cardStyle =
                'bg-slate-50/70 border-slate-200 hover:border-slate-300 text-slate-700';
              let statusText = 'Livre';
              let statusColor = 'text-emerald-700';

              if (table.status === 'ready') {
                cardStyle =
                  'bg-amber-50/90 border-amber-400 hover:border-amber-500 text-slate-900';
                statusText = 'Pronto na Cozinha!';
                statusColor = 'text-amber-800 font-bold';
              } else if (table.status === 'bill_requested') {
                cardStyle =
                  'bg-purple-50/90 border-purple-400 hover:border-purple-500 text-slate-900';
                statusText = 'Pediu a Conta';
                statusColor = 'text-purple-800 font-bold';
              } else if (table.status === 'occupied') {
                cardStyle =
                  'bg-blue-50/70 border-blue-300 hover:border-blue-400 text-slate-900';
                statusText = 'Ocupada';
                statusColor = 'text-blue-700 font-semibold';
              }

              return (
                <button
                  key={table.number}
                  type="button"
                  onClick={() => {
                    setSelectedTableNumber(table.number);
                    if (table.status === 'bill_requested' || table.status === 'ready') {
                      setRightPanelTab('bill');
                    }
                  }}
                  className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between min-h-[116px] cursor-pointer ${cardStyle} ${
                    isSelected ? 'ring-2 ring-blue-600 border-blue-600 shadow-sm' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-1 w-full">
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">
                        Mesa {table.number}
                      </span>
                      <span className={`text-[10px] ${statusColor} block mt-0.5`}>
                        {statusText}
                      </span>
                    </div>
                    {table.status === 'ready' && (
                      <BellRing className="w-4 h-4 text-amber-600 shrink-0" />
                    )}
                    {table.status === 'bill_requested' && (
                      <Receipt className="w-4 h-4 text-purple-600 shrink-0" />
                    )}
                  </div>

                  {table.orders.length > 0 ? (
                    <div className="pt-2 mt-2 border-t border-slate-200/80 w-full space-y-0.5">
                      <p className="text-sm font-bold font-mono text-slate-950 tabular-nums">
                        {formatBRL(table.subtotalCents)}
                      </p>
                      <div className="flex items-center justify-between text-[10px] text-slate-500">
                        <span>{table.totalItemsCount} itens</span>
                        <span className="truncate max-w-[75px]">{table.lastWaiter}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="pt-2 mt-2 border-t border-slate-200/60 w-full flex items-center justify-between text-[10px] text-slate-400">
                      <span>Sem consumo</span>
                      <span>+ Abrir</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* RIGHT COLUMN (5 Cols): COMANDA DIGITAL DA MESA SELECIONADA */}
        <div className="xl:col-span-5 bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden flex flex-col">
          {/* Selected Table Header */}
          <div className="bg-slate-900 text-white p-4 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-white">
                  Mesa {selectedTableNumber}
                </span>
                <span className="text-xs text-slate-300">
                  ·{' '}
                  {currentTableData?.status === 'free'
                    ? 'Mesa Livre'
                    : currentTableData?.status === 'ready'
                    ? 'Prato Pronto p/ Servir'
                    : currentTableData?.status === 'bill_requested'
                    ? 'Aguardando Fechamento'
                    : 'Em Atendimento'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Subtotal acumulado:{' '}
                <strong className="text-white font-mono tabular-nums">
                  {formatBRL(currentTableData?.subtotalCents || 0)}
                </strong>{' '}
                ({currentTableData?.orders.length || 0} pedidos na comanda)
              </p>
            </div>

            {currentTableData && currentTableData.orders.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setTablesRequestingBill((prev) => ({
                    ...prev,
                    [selectedTableNumber]: !prev[selectedTableNumber],
                  }));
                  setRightPanelTab('bill');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
                  tablesRequestingBill[selectedTableNumber]
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                }`}
              >
                {tablesRequestingBill[selectedTableNumber]
                  ? 'Conta Solicitada'
                  : 'Pedir a Conta'}
              </button>
            )}
          </div>

          {/* 3 Sub-Tabs for Selected Table */}
          <div className="grid grid-cols-3 border-b border-slate-200 bg-slate-50 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setRightPanelTab('launch')}
              className={`py-2.5 px-2 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                rightPanelTab === 'launch'
                  ? 'border-blue-600 text-blue-600 bg-white'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              + Lançar Pedido
            </button>
            <button
              type="button"
              onClick={() => setRightPanelTab('bill')}
              className={`py-2.5 px-2 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                rightPanelTab === 'bill'
                  ? 'border-blue-600 text-blue-600 bg-white'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Conta ({currentTableData?.orders.length || 0})
            </button>
            <button
              type="button"
              onClick={() => setRightPanelTab('qrcode')}
              className={`py-2.5 px-2 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                rightPanelTab === 'qrcode'
                  ? 'border-blue-600 text-blue-600 bg-white'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              QR Code Mesa
            </button>
          </div>

          {/* SUB-TAB 1: LANÇAR PEDIDO PELO GARÇOM */}
          {rightPanelTab === 'launch' && (
            <form onSubmit={handleLaunchWaiterOrder} className="p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Garçom / Atendente
                  </label>
                  <select
                    value={selectedWaiter}
                    onChange={(e) => setSelectedWaiter(e.target.value)}
                    className="w-full p-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-900 font-medium"
                  >
                    {DEFAULT_WAITERS.map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Nome do Cliente (Opcional)
                  </label>
                  <input
                    type="text"
                    value={tableCustomerName}
                    onChange={(e) => setTableCustomerName(e.target.value)}
                    placeholder={`Ex: Cliente Mesa ${selectedTableNumber}`}
                    className="w-full p-2 text-xs border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>
              </div>

              {/* Search & Category Filter */}
              <div className="space-y-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Buscar produto para adicionar na Mesa..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:bg-white outline-none"
                  />
                </div>

                <div className="flex gap-1.5 overflow-x-auto pb-1 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setSelectedCategoryId('all')}
                    className={`px-2.5 py-1 rounded-md font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                      selectedCategoryId === 'all'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Todos
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSelectedCategoryId(cat.id)}
                      className={`px-2.5 py-1 rounded-md font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                        selectedCategoryId === cat.id
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Compact Product Picker List */}
              <div className="max-h-52 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg">
                {availableProducts.map((prod) => (
                  <div
                    key={prod.id}
                    className="p-2.5 flex items-center justify-between gap-2 hover:bg-slate-50 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 truncate">
                        {prod.name}
                      </p>
                      <p className="text-[11px] font-mono text-slate-500 tabular-nums">
                        {formatBRL(prod.priceCents)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddToWaiterCart(prod)}
                      className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Incluir</span>
                    </button>
                  </div>
                ))}
              </div>

              {/* Waiter Cart Items to Launch */}
              {waiterCart.length > 0 && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                    <span>Itens para Enviar à Cozinha (Mesa {selectedTableNumber})</span>
                    <span className="font-mono tabular-nums text-blue-600">
                      {formatBRL(waiterCartSubtotalCents)}
                    </span>
                  </div>

                  <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                    {waiterCart.map((entry) => (
                      <div
                        key={entry.product.id}
                        className="bg-white border border-slate-200 rounded-lg p-2 space-y-1.5 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-900 truncate">
                            {entry.product.name}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleChangeWaiterCartQty(entry.product.id, -1)}
                              className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="font-mono font-bold w-5 text-center tabular-nums">
                              {entry.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleChangeWaiterCartQty(entry.product.id, 1)}
                              className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                        <input
                          type="text"
                          value={entry.notes}
                          onChange={(e) =>
                            handleUpdateWaiterItemNote(entry.product.id, e.target.value)
                          }
                          placeholder="Observação p/ cozinha (ex: sem cebola, gelo e limão)..."
                          className="w-full p-1.5 text-[11px] border border-slate-200 rounded bg-slate-50 text-slate-800"
                        />
                      </div>
                    ))}
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                  >
                    <ChefHat className="w-4 h-4" />
                    <span>
                      Disparar para a Cozinha (KDS) · {formatBRL(waiterCartSubtotalCents)}
                    </span>
                  </button>
                </div>
              )}
            </form>
          )}

          {/* SUB-TAB 2: CONTA DA MESA, DIVISÃO & FECHAMENTO */}
          {rightPanelTab === 'bill' && (
            <div className="p-4 space-y-4">
              {currentTableData && currentTableData.orders.length > 0 ? (
                <>
                  {/* Ready-to-serve alert if any order is ready in KDS */}
                  {currentTableData.orders
                    .filter((o) => o.status === 'ready' && !servedOrderIds[o.id])
                    .map((readyOrder) => (
                      <div
                        key={readyOrder.id}
                        className="p-3 bg-amber-50 border border-amber-300 rounded-xl flex items-center justify-between gap-2 text-xs"
                      >
                        <div>
                          <p className="font-bold text-amber-950">
                            🔔 Pedido #{readyOrder.orderNumber} pronto no balcão da cozinha!
                          </p>
                          <p className="text-[11px] text-amber-800">
                            Leve até a Mesa {selectedTableNumber} e confirme abaixo.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            handleMarkDishServedAtTable(
                              readyOrder.id,
                              readyOrder.orderNumber
                            )
                          }
                          className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-[11px] shrink-0 cursor-pointer"
                        >
                          Marcar Servido
                        </button>
                      </div>
                    ))}

                  {/* Consumed Items List */}
                  <div className="space-y-2 max-h-56 overflow-y-auto border border-slate-200 rounded-xl p-3 divide-y divide-slate-100">
                    {billCalculations.allItems.map((entry, idx) => (
                      <div
                        key={`${entry.orderId}_${idx}`}
                        className="pt-2 first:pt-0 flex items-start justify-between gap-2 text-xs"
                      >
                        <div>
                          <p className="font-semibold text-slate-900">
                            {entry.item.quantity}x {entry.item.productName}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            Pedido #{entry.orderNumber} · {entry.waiterOrSource} ·{' '}
                            {entry.createdAt}
                          </p>
                          {entry.item.notes && (
                            <p className="text-[10px] text-amber-700 italic">
                              Obs: {entry.item.notes}
                            </p>
                          )}
                        </div>
                        <span className="font-mono font-bold text-slate-900 tabular-nums shrink-0">
                          {formatBRL(entry.item.totalCents)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Service Fee (10%) & Split by Person Calculator */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-800">
                        <input
                          type="checkbox"
                          checked={includeServiceFee}
                          onChange={(e) => setIncludeServiceFee(e.target.checked)}
                          className="w-4 h-4 accent-blue-600 rounded"
                        />
                        <span>Incluir Taxa de Serviço do Garçom (10%)</span>
                      </label>
                      <span className="font-mono font-semibold text-slate-700 tabular-nums">
                        +{formatBRL(billCalculations.serviceFeeCents)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                      <span className="text-slate-600 flex items-center gap-1.5 font-medium">
                        <Users className="w-3.5 h-3.5 text-slate-500" />
                        <span>Dividir conta entre:</span>
                      </span>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5, 6].map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setSplitPeopleCount(n)}
                            className={`w-7 h-7 rounded-md font-mono text-xs font-bold cursor-pointer ${
                              splitPeopleCount === n
                                ? 'bg-blue-600 text-white'
                                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-200 space-y-1">
                      <div className="flex justify-between text-slate-600">
                        <span>Subtotal Consumo:</span>
                        <span className="font-mono tabular-nums">
                          {formatBRL(billCalculations.subtotalCents)}
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-900 font-bold text-sm">
                        <span>Total da Mesa {selectedTableNumber}:</span>
                        <span className="font-mono tabular-nums text-blue-600">
                          {formatBRL(billCalculations.grandTotalCents)}
                        </span>
                      </div>
                      {splitPeopleCount > 1 && (
                        <div className="flex justify-between text-emerald-800 font-semibold text-xs pt-0.5">
                          <span>Valor por pessoa ({splitPeopleCount} pessoas):</span>
                          <span className="font-mono tabular-nums">
                            {formatBRL(billCalculations.perPersonCents)} / pessoa
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Payment Method & Close Table Button */}
                  <div className="space-y-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Forma de Pagamento no Fechamento da Mesa
                      </label>
                      <select
                        value={closingPaymentMethod}
                        onChange={(e) => setClosingPaymentMethod(e.target.value)}
                        className="w-full p-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-900 font-semibold"
                      >
                        <option value="Pix Direto na Conta da Loja">
                          ⚡ Pix Direto na Conta da Loja (0% Taxa)
                        </option>
                        <option value="Cartão de Crédito na Maquininha">
                          💳 Cartão de Crédito (Maquininha)
                        </option>
                        <option value="Cartão de Débito na Maquininha">
                          💳 Cartão de Débito (Maquininha)
                        </option>
                        <option value="Dinheiro no Caixa">💵 Dinheiro</option>
                      </select>
                    </div>

                    <div className="flex gap-2">
                      {onPrintOrder && currentTableData.orders[0] && (
                        <button
                          type="button"
                          onClick={() => onPrintOrder(currentTableData.orders[0])}
                          className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>Imprimir Pré-Conta</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={handleCloseTableAccount}
                        className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                      >
                        <Check className="w-4 h-4" />
                        <span>
                          Receber {formatBRL(billCalculations.grandTotalCents)} &amp; Liberar Mesa
                        </span>
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-10 px-4 space-y-3">
                  <Utensils className="w-8 h-8 text-slate-300 mx-auto" />
                  <div>
                    <p className="text-xs font-bold text-slate-800">
                      A Mesa {selectedTableNumber} está Livre no momento
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Lance um pedido pela aba <strong>+ Lançar Pedido</strong> ou peça para o cliente escanear o <strong>QR Code da Mesa {selectedTableNumber}</strong>.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRightPanelTab('launch')}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg cursor-pointer"
                  >
                    + Lançar Primeiro Pedido na Mesa {selectedTableNumber}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* SUB-TAB 3: QR CODE EXCLUSIVO DA MESA */}
          {rightPanelTab === 'qrcode' && (
            <div className="p-5 text-center space-y-4">
              <div className="inline-block p-4 bg-white border-2 border-slate-900 rounded-2xl shadow-sm">
                <p className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-1">
                  {tenant.name}
                </p>
                <span className="inline-block px-3 py-0.5 rounded-md bg-blue-600 text-white text-xs font-bold mb-2">
                  MESA {selectedTableNumber}
                </span>
                {tableQrDataUrl ? (
                  <img
                    src={tableQrDataUrl}
                    alt={`QR Code Mesa ${selectedTableNumber}`}
                    className="w-44 h-44 mx-auto"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-44 h-44 mx-auto flex items-center justify-center bg-slate-100 rounded-lg">
                    <QrCode className="w-10 h-10 text-slate-400" />
                  </div>
                )}
                <p className="text-[11px] text-slate-600 font-medium mt-2">
                  Aponte a câmera do celular para fazer seu pedido direto da Mesa {selectedTableNumber}
                </p>
              </div>

              <div className="p-2.5 bg-slate-100 rounded-lg font-mono text-[11px] text-slate-700 truncate">
                {selectedTableMenuUrl}
              </div>

              <div className="flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(selectedTableMenuUrl);
                    setQrLinkCopied(true);
                    setTimeout(() => setQrLinkCopied(false), 2500);
                  }}
                  className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{qrLinkCopied ? 'Link Copiado!' : 'Copiar Link da Mesa'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Imprimir Plaquinha</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
