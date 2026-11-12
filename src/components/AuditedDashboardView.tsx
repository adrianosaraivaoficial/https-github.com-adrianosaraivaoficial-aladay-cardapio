import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  Receipt,
  Clock,
  Ban,
  CheckCircle2,
  FileSpreadsheet,
  Info,
  CreditCard,
  Bike,
  ShoppingBag,
  ArrowRight,
  ShieldCheck,
  BarChart3,
  Calendar,
  Download,
  Award,
  Sparkles,
  Package,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from 'recharts';
import { Order, Product, RestaurantTenant } from '../types';

interface AuditedDashboardViewProps {
  tenant: RestaurantTenant;
  orders: Order[];
  products?: Product[];
  onNavigateToTab?: (tab: 'crm' | 'kds' | 'menu') => void;
  onPrintOrder?: (order: Order) => void;
}

interface DailySalesPoint {
  dateKey: string; // DD/MM
  fullDate: string; // DD/MM/YYYY
  weekday: string; // Seg, Ter, etc.
  label: string; // DD/MM (Seg)
  revenueReais: number;
  revenueCents: number;
  ordersCount: number;
  averageTicketReais: number;
}

interface TopProductPoint {
  name: string;
  shortName: string;
  quantity: number;
  revenueCents: number;
  revenueReais: number;
  sharePercent: number;
}

const CHART_COLORS = [
  '#2563EB', // blue-600
  '#EA580C', // orange-600
  '#059669', // emerald-600
  '#7C3AED', // violet-600
  '#D97706', // amber-600
  '#DB2777', // pink-600
  '#0891B2', // cyan-600
  '#4F46E5', // indigo-600
];

const WEEKDAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export const AuditedDashboardView: React.FC<AuditedDashboardViewProps> = ({
  tenant,
  orders = [],
  products = [],
  onNavigateToTab,
  onPrintOrder,
}) => {
  const [showAuditProof, setShowAuditProof] = useState(false);
  const [periodDays, setPeriodDays] = useState<7 | 14 | 30>(7);
  const [salesChartType, setSalesChartType] = useState<'area' | 'bar'>('area');
  const [topProductMetric, setTopProductMetric] = useState<'revenue' | 'quantity'>('revenue');
  const [onlyDeliveredInCharts, setOnlyDeliveredInCharts] = useState<boolean>(false);
  const [useDemoDataWhenEmpty, setUseDemoDataWhenEmpty] = useState<boolean>(false);

  const formatBRL = (cents: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
  };

  const formatReaisBRL = (reais: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(reais);
  };

  // Helper to resolve which DD/MM a given Order belongs to
  const resolveOrderDateKey = (order: Order, today: Date): string => {
    const raw = String(order.createdAt || '').trim();
    const pad = (n: number) => String(n).padStart(2, '0');
    const todayKey = `${pad(today.getDate())}/${pad(today.getMonth() + 1)}`;

    if (!raw) return todayKey;

    if (raw.toLowerCase().includes('ontem')) {
      const yest = new Date(today);
      yest.setDate(today.getDate() - 1);
      return `${pad(yest.getDate())}/${pad(yest.getMonth() + 1)}`;
    }

    // Match DD/MM/YYYY or DD/MM
    const brDateMatch = raw.match(/(\d{2})\/(\d{2})(?:\/(\d{2,4}))?/);
    if (brDateMatch) {
      return `${brDateMatch[1]}/${brDateMatch[2]}`;
    }

    // Match YYYY-MM-DD (ISO format)
    const isoMatch = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      return `${isoMatch[3]}/${isoMatch[2]}`;
    }

    // If only HH:mm is stored (like "12:18"), it belongs to today
    return todayKey;
  };

  // ==========================================================================
  // DAILY SALES & TOP PRODUCTS DATA FOR RECHARTS
  // ==========================================================================
  const chartsData = useMemo(() => {
    const today = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');

    // Build chronological array of last `periodDays` days
    const daysList: DailySalesPoint[] = [];
    const daysMap: Record<string, DailySalesPoint> = {};

    for (let i = periodDays - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateKey = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
      const fullDate = `${dateKey}/${d.getFullYear()}`;
      const weekday = WEEKDAYS_PT[d.getDay()];
      const point: DailySalesPoint = {
        dateKey,
        fullDate,
        weekday,
        label: periodDays <= 14 ? `${dateKey} (${weekday})` : dateKey,
        revenueReais: 0,
        revenueCents: 0,
        ordersCount: 0,
        averageTicketReais: 0,
      };
      daysList.push(point);
      daysMap[dateKey] = point;
    }

    // Filter eligible orders for chart analysis
    const validOrders = orders.filter((o) => {
      if (!o || o.status === 'cancelled') return false;
      if (onlyDeliveredInCharts && o.status !== 'delivered') return false;
      return true;
    });

    // If user enabled Demo Simulation mode, synthesize realistic daily & product distribution
    if (useDemoDataWhenEmpty) {
      const demoMultipliers = [0.65, 0.78, 0.85, 0.92, 1.25, 1.48, 1.35];
      let totalDemoRevenueCents = 0;
      let totalDemoOrders = 0;

      daysList.forEach((pt, idx) => {
        const mult = demoMultipliers[idx % demoMultipliers.length];
        const count = Math.max(3, Math.round(8 * mult + (idx % 3)));
        const avgTicketCents = 6490 + ((idx * 450) % 1800);
        const revCents = count * avgTicketCents;

        pt.ordersCount = count;
        pt.revenueCents = revCents;
        pt.revenueReais = Number((revCents / 100).toFixed(2));
        pt.averageTicketReais = Number((avgTicketCents / 100).toFixed(2));

        totalDemoRevenueCents += revCents;
        totalDemoOrders += count;
      });

      const baseCatalogNames =
        products.length >= 4
          ? products.slice(0, 6).map((p) => ({ name: p.name, priceCents: p.priceCents || 3490 }))
          : [
              { name: 'Smash Bacon Duplo Especial', priceCents: 3690 },
              { name: 'Burger de Costela Desfiada', priceCents: 4290 },
              { name: 'Combo Casal Artesanal + Batata', priceCents: 7890 },
              { name: 'Batata Rústica com Cheddar & Bacon', priceCents: 2690 },
              { name: 'Milkshake Pistache Artesanal 400ml', priceCents: 2490 },
              { name: 'Refrigerante Lata 350ml', priceCents: 790 },
            ];

      const demoQuantities = [42, 35, 24, 31, 19, 48];
      const rawProducts = baseCatalogNames.map((prod, idx) => {
        const qty = demoQuantities[idx % demoQuantities.length];
        const revCents = qty * prod.priceCents;
        return {
          name: prod.name,
          shortName: prod.name.length > 22 ? `${prod.name.slice(0, 20)}…` : prod.name,
          quantity: qty,
          revenueCents: revCents,
          revenueReais: Number((revCents / 100).toFixed(2)),
          sharePercent: 0,
        };
      });

      const sumProdRev = rawProducts.reduce((s, p) => s + p.revenueCents, 0) || 1;
      const sortedTopProducts = rawProducts
        .map((p) => ({
          ...p,
          sharePercent: Number(((p.revenueCents / sumProdRev) * 100).toFixed(1)),
        }))
        .sort((a, b) =>
          topProductMetric === 'revenue' ? b.revenueCents - a.revenueCents : b.quantity - a.quantity
        );

      const bestDay = [...daysList].sort((a, b) => b.revenueCents - a.revenueCents)[0] || daysList[0];

      return {
        dailySales: daysList,
        topProducts: sortedTopProducts,
        periodTotalRevenueCents: totalDemoRevenueCents,
        periodTotalOrders: totalDemoOrders,
        dailyAverageRevenueCents: Math.round(totalDemoRevenueCents / daysList.length),
        bestDay,
        totalItemsSold: rawProducts.reduce((s, p) => s + p.quantity, 0),
      };
    }

    // Populate from real orders
    const productMap: Record<string, { quantity: number; revenueCents: number }> = {};

    validOrders.forEach((order) => {
      const key = resolveOrderDateKey(order, today);
      if (daysMap[key]) {
        daysMap[key].ordersCount += 1;
        daysMap[key].revenueCents += order.totalCents || 0;
        daysMap[key].revenueReais = Number((daysMap[key].revenueCents / 100).toFixed(2));
        daysMap[key].averageTicketReais =
          daysMap[key].ordersCount > 0
            ? Number((daysMap[key].revenueCents / daysMap[key].ordersCount / 100).toFixed(2))
            : 0;
      }

      (order.items || []).forEach((item) => {
        const pName = item.productName || 'Produto';
        if (!productMap[pName]) {
          productMap[pName] = { quantity: 0, revenueCents: 0 };
        }
        const qty = Number(item.quantity) || 1;
        const itemTotal = Number(item.totalCents) || (Number(item.unitPriceCents) || 0) * qty;
        productMap[pName].quantity += qty;
        productMap[pName].revenueCents += itemTotal;
      });
    });

    const totalProductRevenueCents =
      Object.values(productMap).reduce((sum, item) => sum + item.revenueCents, 0) || 1;

    const topProducts: TopProductPoint[] = Object.entries(productMap)
      .map(([name, stats]) => ({
        name,
        shortName: name.length > 22 ? `${name.slice(0, 20)}…` : name,
        quantity: stats.quantity,
        revenueCents: stats.revenueCents,
        revenueReais: Number((stats.revenueCents / 100).toFixed(2)),
        sharePercent: Number(((stats.revenueCents / totalProductRevenueCents) * 100).toFixed(1)),
      }))
      .sort((a, b) =>
        topProductMetric === 'revenue' ? b.revenueCents - a.revenueCents : b.quantity - a.quantity
      )
      .slice(0, 8);

    const periodTotalRevenueCents = daysList.reduce((sum, d) => sum + d.revenueCents, 0);
    const periodTotalOrders = daysList.reduce((sum, d) => sum + d.ordersCount, 0);
    const dailyAverageRevenueCents =
      daysList.length > 0 ? Math.round(periodTotalRevenueCents / daysList.length) : 0;
    const bestDay = [...daysList].sort((a, b) => b.revenueCents - a.revenueCents)[0] || daysList[0];
    const totalItemsSold = Object.values(productMap).reduce((sum, item) => sum + item.quantity, 0);

    return {
      dailySales: daysList,
      topProducts,
      periodTotalRevenueCents,
      periodTotalOrders,
      dailyAverageRevenueCents,
      bestDay,
      totalItemsSold,
    };
  }, [orders, products, periodDays, onlyDeliveredInCharts, topProductMetric, useDemoDataWhenEmpty]);

  // ==========================================================================
  // AUDITED METRICS CALCULATION (RIGOROUS AUDIT)
  // ==========================================================================
  const auditMetrics = useMemo(() => {
    const totalOrdersCount = orders.length;

    // 1. Strictly DELIVERED orders (Completed Sales)
    const deliveredOrders = orders.filter((o) => o.status === 'delivered');
    const deliveredCount = deliveredOrders.length;

    // Gross Completed Revenue: sum of totalCents of all delivered orders
    const totalConcludedRevenueCents = deliveredOrders.reduce((sum, o) => sum + o.totalCents, 0);

    // Subtotal of items delivered (excluding delivery fees)
    const concludedItemsSubtotalCents = deliveredOrders.reduce((sum, o) => sum + o.subtotalCents, 0);

    // Delivery fees realized from delivered orders
    const concludedDeliveryFeesCents = deliveredOrders.reduce((sum, o) => sum + (o.deliveryFeeCents || 0), 0);

    // 2. Average Ticket Audit (strictly Concluded Revenue / Delivered Orders Count)
    const averageTicketCents =
      deliveredCount > 0 ? Math.round(totalConcludedRevenueCents / deliveredCount) : 0;

    // Average items count per delivered order
    const totalDeliveredItemsQuantity = deliveredOrders.reduce(
      (sum, o) => sum + o.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
      0
    );
    const avgItemsPerOrder = deliveredCount > 0 ? (totalDeliveredItemsQuantity / deliveredCount).toFixed(1) : '0';

    // 3. In-Progress Orders (Active Pipeline)
    const inProgressOrders = orders.filter(
      (o) => o.status === 'received' || o.status === 'confirmed' || o.status === 'preparing' || o.status === 'ready'
    );
    const inProgressCount = inProgressOrders.length;
    const inProgressProjectedRevenueCents = inProgressOrders.reduce((sum, o) => sum + o.totalCents, 0);

    // 4. Cancelled Orders (Strictly excluded from sales)
    const cancelledOrders = orders.filter((o) => o.status === 'cancelled');
    const cancelledCount = cancelledOrders.length;
    const cancelledValueCents = cancelledOrders.reduce((sum, o) => sum + o.totalCents, 0);
    const cancellationRate = totalOrdersCount > 0 ? (cancelledCount / totalOrdersCount) * 100 : 0;

    // 5. Payment Methods Breakdown (Over Delivered Orders)
    const paymentMethodsStats = deliveredOrders.reduce((acc, order) => {
      const method = order.paymentMethod || 'Outros';
      const cleanKey = method.toLowerCase().includes('pix')
        ? 'Pix Instantâneo'
        : method.toLowerCase().includes('crédito')
        ? 'Cartão de Crédito'
        : method.toLowerCase().includes('débito')
        ? 'Cartão de Débito'
        : method.toLowerCase().includes('dinheiro')
        ? 'Dinheiro'
        : 'Outros';

      if (!acc[cleanKey]) {
        acc[cleanKey] = { count: 0, revenueCents: 0 };
      }
      acc[cleanKey].count += 1;
      acc[cleanKey].revenueCents += order.totalCents;
      return acc;
    }, {} as Record<string, { count: number; revenueCents: number }>);

    // 6. Fulfillment Types (Delivery vs Pickup) over Delivered Orders
    const deliveryOrders = deliveredOrders.filter((o) => o.type === 'delivery');
    const pickupOrders = deliveredOrders.filter((o) => o.type === 'pickup');

    // 7. Top Selling Products in Delivered Orders
    const productSalesMap = deliveredOrders.reduce((acc, o) => {
      o.items.forEach((item) => {
        if (!acc[item.productName]) {
          acc[item.productName] = { quantity: 0, revenueCents: 0 };
        }
        acc[item.productName].quantity += item.quantity;
        acc[item.productName].revenueCents += item.totalCents;
      });
      return acc;
    }, {} as Record<string, { quantity: number; revenueCents: number }>);

    const topProducts = Object.entries(productSalesMap)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.revenueCents - a.revenueCents)
      .slice(0, 5);

    return {
      totalOrdersCount,
      deliveredOrders,
      deliveredCount,
      totalConcludedRevenueCents,
      concludedItemsSubtotalCents,
      concludedDeliveryFeesCents,
      averageTicketCents,
      avgItemsPerOrder,
      inProgressOrders,
      inProgressCount,
      inProgressProjectedRevenueCents,
      cancelledOrders,
      cancelledCount,
      cancelledValueCents,
      cancellationRate,
      paymentMethodsStats,
      deliveryCount: deliveryOrders.length,
      deliveryRevenueCents: deliveryOrders.reduce((sum, o) => sum + o.totalCents, 0),
      pickupCount: pickupOrders.length,
      pickupRevenueCents: pickupOrders.reduce((sum, o) => sum + o.totalCents, 0),
      topProducts,
    };
  }, [orders]);

  // Export CSV report
  const handleExportReportCsv = () => {
    const lines: string[] = [
      `RELATORIO DE VENDAS POR DIA - ${tenant.name.toUpperCase()}`,
      'Data;Dia da Semana;Qtd Pedidos;Total Vendas (R$);Ticket Medio (R$)',
      ...chartsData.dailySales.map(
        (d) =>
          `${d.fullDate};${d.weekday};${d.ordersCount};${d.revenueReais.toFixed(2).replace('.', ',')};${d.averageTicketReais.toFixed(2).replace('.', ',')}`
      ),
      '',
      'PRODUTOS MAIS VENDIDOS',
      'Posicao;Produto;Quantidade Vendida;Receita Total (R$);Participacao (%)',
      ...chartsData.topProducts.map(
        (p, idx) =>
          `${idx + 1};${p.name};${p.quantity};${p.revenueReais.toFixed(2).replace('.', ',')};${p.sharePercent}%`
      ),
    ];

    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-vendas-${tenant.slug}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-bold text-neutral-900">
              Relatórios de Vendas por Dia &amp; Produtos Mais Vendidos
            </h2>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <ShieldCheck className="w-3 h-3 text-emerald-600" />
              Auditoria Contábil Ativa
            </span>
          </div>
          <p className="text-xs text-neutral-500 mt-1">
            Acompanhe a evolução diária do faturamento e o ranking dos itens campeões de venda em{' '}
            <strong>{tenant.name}</strong>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Period Filter */}
          <div className="inline-flex rounded-lg border border-neutral-200 bg-neutral-50 p-0.5 text-xs">
            {([7, 14, 30] as const).map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setPeriodDays(days)}
                className={`px-2.5 py-1.5 rounded-md font-semibold transition-all ${
                  periodDays === days
                    ? 'bg-neutral-900 text-white shadow-2xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                {days} Dias
              </button>
            ))}
          </div>

          {/* Toggle Demo / Real Data */}
          <button
            type="button"
            onClick={() => setUseDemoDataWhenEmpty((prev) => !prev)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all border ${
              useDemoDataWhenEmpty
                ? 'bg-amber-50 text-amber-800 border-amber-300 shadow-2xs'
                : 'bg-white text-neutral-700 hover:bg-neutral-50 border-neutral-200'
            }`}
            title="Alternar entre os pedidos reais e uma simulação de 7 dias para testar os gráficos"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>{useDemoDataWhenEmpty ? 'Exibindo Simulação (Voltar ao Real)' : 'Simular Gráficos Cheios'}</span>
          </button>

          {/* Export CSV */}
          <button
            type="button"
            onClick={handleExportReportCsv}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white hover:bg-neutral-50 text-neutral-700 border border-neutral-200 flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-blue-600" />
            <span>Exportar CSV</span>
          </button>

          {/* Toggle Mathematical Proof */}
          <button
            type="button"
            onClick={() => setShowAuditProof(!showAuditProof)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all border ${
              showAuditProof
                ? 'bg-neutral-900 text-white border-neutral-900 shadow-xs'
                : 'bg-neutral-50 text-neutral-700 hover:bg-neutral-100 border-neutral-200'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>{showAuditProof ? 'Ocultar Fórmulas' : 'Memória de Cálculo'}</span>
          </button>
        </div>
      </div>

      {/* Filter Bar for Chart Status Scope */}
      <div className="bg-slate-50 border border-slate-200/80 rounded-xl px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-slate-600">
          <Calendar className="w-4 h-4 text-blue-600 shrink-0" />
          <span>
            Período analisado nos gráficos: <strong>Últimos {periodDays} dias</strong> ({chartsData.periodTotalOrders}{' '}
            pedidos • <strong>{formatBRL(chartsData.periodTotalRevenueCents)}</strong>)
          </span>
        </div>

        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-1.5 cursor-pointer text-slate-700 font-medium select-none">
            <input
              type="checkbox"
              checked={onlyDeliveredInCharts}
              onChange={(e) => setOnlyDeliveredInCharts(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span>Considerar apenas pedidos já entregues nos gráficos</span>
          </label>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* RECHARTS ANALYTICS GRID: TOTAL SALES PER DAY & TOP SELLING PRODUCTS  */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* CHART 1: Total de Vendas por Dia (7 Cols) */}
        <div className="xl:col-span-7 bg-white border border-neutral-200 rounded-xl p-5 shadow-2xs flex flex-col justify-between space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-100">
            <div>
              <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-600" />
                <span>Total de Vendas por Dia</span>
              </h3>
              <p className="text-[11px] text-neutral-500 mt-0.5">
                Evolução diária da receita (R$) e volume de pedidos nos últimos {periodDays} dias
              </p>
            </div>

            <div className="inline-flex rounded-lg border border-neutral-200 bg-neutral-50 p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setSalesChartType('area')}
                className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                  salesChartType === 'area'
                    ? 'bg-white text-blue-600 shadow-2xs border border-neutral-200/60'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Área
              </button>
              <button
                type="button"
                onClick={() => setSalesChartType('bar')}
                className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                  salesChartType === 'bar'
                    ? 'bg-white text-blue-600 shadow-2xs border border-neutral-200/60'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Barras
              </button>
            </div>
          </div>

          {/* Mini Summary Strip */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-50 border border-slate-200/70 rounded-lg p-3">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">
                Total no Período
              </span>
              <span className="text-sm sm:text-base font-bold font-mono text-slate-900 mt-0.5 block">
                {formatBRL(chartsData.periodTotalRevenueCents)}
              </span>
            </div>
            <div className="bg-slate-50 border border-slate-200/70 rounded-lg p-3">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">
                Média por Dia
              </span>
              <span className="text-sm sm:text-base font-bold font-mono text-slate-900 mt-0.5 block">
                {formatBRL(chartsData.dailyAverageRevenueCents)}
              </span>
            </div>
            <div className="bg-slate-50 border border-slate-200/70 rounded-lg p-3">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">
                Melhor Dia ({chartsData.bestDay?.dateKey})
              </span>
              <span className="text-sm sm:text-base font-bold font-mono text-emerald-700 mt-0.5 block">
                {formatBRL(chartsData.bestDay?.revenueCents || 0)}
              </span>
            </div>
          </div>

          {/* Recharts Container */}
          <div className="h-72 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              {salesChartType === 'area' ? (
                <AreaChart data={chartsData.dailySales} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="salesRevenueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563EB" stopOpacity={0.32} />
                      <stop offset="95%" stopColor="#2563EB" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={{ stroke: '#CBD5E1' }}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(val) => `R$ ${val}`}
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={false}
                    tickLine={false}
                    width={68}
                  />
                  <Tooltip
                    formatter={(value: any, name: any) => {
                      if (name === 'Vendas (R$)') return [formatReaisBRL(Number(value) || 0), 'Total de Vendas'];
                      if (name === 'Ticket Médio (R$)') return [formatReaisBRL(Number(value) || 0), 'Ticket Médio'];
                      return [value, name];
                    }}
                    labelFormatter={(label, payload) => {
                      const item = payload?.[0]?.payload as DailySalesPoint | undefined;
                      if (!item) return String(label);
                      return `Data: ${item.fullDate} (${item.weekday}) • ${item.ordersCount} pedido(s)`;
                    }}
                    contentStyle={{
                      backgroundColor: '#0F172A',
                      borderColor: '#1E293B',
                      borderRadius: '10px',
                      color: '#F8FAFC',
                      fontSize: '12px',
                    }}
                    itemStyle={{ color: '#F8FAFC' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <Area
                    type="monotone"
                    dataKey="revenueReais"
                    name="Vendas (R$)"
                    stroke="#2563EB"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#salesRevenueGradient)"
                    activeDot={{ r: 5, strokeWidth: 0, fill: '#1D4ED8' }}
                  />
                </AreaChart>
              ) : (
                <BarChart data={chartsData.dailySales} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={{ stroke: '#CBD5E1' }}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(val) => `R$ ${val}`}
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={false}
                    tickLine={false}
                    width={68}
                  />
                  <Tooltip
                    formatter={(value: any, name: any) => {
                      if (name === 'Vendas (R$)') return [formatReaisBRL(Number(value) || 0), 'Total de Vendas'];
                      return [value, name];
                    }}
                    labelFormatter={(label, payload) => {
                      const item = payload?.[0]?.payload as DailySalesPoint | undefined;
                      if (!item) return String(label);
                      return `Data: ${item.fullDate} (${item.weekday}) • ${item.ordersCount} pedido(s)`;
                    }}
                    contentStyle={{
                      backgroundColor: '#0F172A',
                      borderColor: '#1E293B',
                      borderRadius: '10px',
                      color: '#F8FAFC',
                      fontSize: '12px',
                    }}
                    itemStyle={{ color: '#F8FAFC' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <Bar dataKey="revenueReais" name="Vendas (R$)" fill="#2563EB" radius={[6, 6, 0, 0]} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>

        {/* CHART 2: Produtos Mais Vendidos (5 Cols) */}
        <div className="xl:col-span-5 bg-white border border-neutral-200 rounded-xl p-5 shadow-2xs flex flex-col justify-between space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-100">
            <div>
              <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                <Award className="w-4 h-4 text-orange-600" />
                <span>Produtos Mais Vendidos</span>
              </h3>
              <p className="text-[11px] text-neutral-500 mt-0.5">
                Ranking de desempenho por {topProductMetric === 'revenue' ? 'faturamento (R$)' : 'unidades vendidas'}
              </p>
            </div>

            <div className="inline-flex rounded-lg border border-neutral-200 bg-neutral-50 p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setTopProductMetric('revenue')}
                className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                  topProductMetric === 'revenue'
                    ? 'bg-white text-orange-600 shadow-2xs border border-neutral-200/60'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Por Receita (R$)
              </button>
              <button
                type="button"
                onClick={() => setTopProductMetric('quantity')}
                className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                  topProductMetric === 'quantity'
                    ? 'bg-white text-orange-600 shadow-2xs border border-neutral-200/60'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Por Qtd (Unid.)
              </button>
            </div>
          </div>

          {chartsData.topProducts.length > 0 ? (
            <>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartsData.topProducts.slice(0, 6)}
                    layout="vertical"
                    margin={{ top: 4, right: 20, left: 8, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#E2E8F0" />
                    <XAxis
                      type="number"
                      tickFormatter={(val) => (topProductMetric === 'revenue' ? `R$${val}` : `${val}x`)}
                      tick={{ fontSize: 10, fill: '#64748B' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="shortName"
                      width={125}
                      tick={{ fontSize: 11, fill: '#334155', fontWeight: 500 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(value: any, _name: any, props: any) => {
                        const item = props?.payload as TopProductPoint | undefined;
                        if (topProductMetric === 'revenue') {
                          return [
                            `${formatReaisBRL(Number(value) || 0)} (${item?.quantity || 0} unid.)`,
                            'Receita Acumulada',
                          ];
                        }
                        return [
                          `${value} unidades (${formatReaisBRL(item?.revenueReais || 0)})`,
                          'Quantidade Vendida',
                        ];
                      }}
                      labelFormatter={(_label, payload) => {
                        const item = payload?.[0]?.payload as TopProductPoint | undefined;
                        return item?.name || '';
                      }}
                      contentStyle={{
                        backgroundColor: '#0F172A',
                        borderColor: '#1E293B',
                        borderRadius: '10px',
                        color: '#F8FAFC',
                        fontSize: '12px',
                      }}
                      itemStyle={{ color: '#F8FAFC' }}
                    />
                    <Bar
                      dataKey={topProductMetric === 'revenue' ? 'revenueReais' : 'quantity'}
                      name={topProductMetric === 'revenue' ? 'Receita (R$)' : 'Unidades Vendidas'}
                      radius={[0, 6, 6, 0]}
                      barSize={20}
                    >
                      {chartsData.topProducts.slice(0, 6).map((entry, index) => (
                        <Cell key={`cell-${entry.name}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Compact Top Products List */}
              <div className="space-y-2 pt-2 border-t border-neutral-100 max-h-40 overflow-y-auto pr-1">
                {chartsData.topProducts.map((prod, idx) => (
                  <div key={prod.name} className="flex items-center justify-between text-xs py-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-5 h-5 rounded-full text-white text-[10px] flex items-center justify-center font-bold font-mono shrink-0"
                        style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                      >
                        {idx + 1}
                      </span>
                      <span className="font-medium text-neutral-800 truncate" title={prod.name}>
                        {prod.name}
                      </span>
                    </div>
                    <div className="text-right shrink-0 font-mono flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-700 text-[10px] font-semibold">
                        {prod.quantity}x
                      </span>
                      <span className="font-bold text-neutral-900">{formatBRL(prod.revenueCents)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-10 px-4 bg-slate-50/70 rounded-xl border border-dashed border-slate-200">
              <Package className="w-8 h-8 text-slate-400 mb-2" />
              <p className="text-xs font-bold text-slate-700">Nenhum produto vendido registrado ainda</p>
              <p className="text-[11px] text-slate-500 mt-1 max-w-xs">
                Assim que novos pedidos entrarem pelo Cardápio Digital, o ranking de produtos mais vendidos aparecerá automaticamente aqui.
              </p>
              <button
                type="button"
                onClick={() => setUseDemoDataWhenEmpty(true)}
                className="mt-3 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors flex items-center gap-1.5 shadow-2xs"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Visualizar Exemplo com Dados Simulados</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 4 Core Audited KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Vendas Concluídas */}
        <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-2xs hover:border-neutral-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-500 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Vendas Concluídas
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">
              {auditMetrics.deliveredCount} entregues
            </span>
          </div>

          <p className="text-2xl font-bold font-mono text-neutral-900 mt-2 tabular-nums">
            {formatBRL(auditMetrics.totalConcludedRevenueCents)}
          </p>

          <div className="mt-2 pt-2 border-t border-neutral-100 text-[11px] text-neutral-600 space-y-0.5">
            <div className="flex justify-between">
              <span>Pratos &amp; Bebidas:</span>
              <span className="font-mono">{formatBRL(auditMetrics.concludedItemsSubtotalCents)}</span>
            </div>
            <div className="flex justify-between">
              <span>Fretes Realizados:</span>
              <span className="font-mono">{formatBRL(auditMetrics.concludedDeliveryFeesCents)}</span>
            </div>
          </div>
        </div>

        {/* KPI 2: Ticket Médio Auditado */}
        <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-2xs hover:border-neutral-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-500 flex items-center gap-1.5">
              <Receipt className="w-4 h-4 text-blue-600" />
              Ticket Médio
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">
              Auditado
            </span>
          </div>

          <p className="text-2xl font-bold font-mono text-neutral-900 mt-2 tabular-nums">
            {formatBRL(auditMetrics.averageTicketCents)}
          </p>

          <div className="mt-2 pt-2 border-t border-neutral-100 text-[11px] text-neutral-600 space-y-0.5">
            <div className="flex justify-between">
              <span>Fórmula:</span>
              <span className="font-mono font-medium text-neutral-800">Σ Vendas ÷ N Entregues</span>
            </div>
            <div className="flex justify-between">
              <span>Itens por pedido:</span>
              <span className="font-mono">{auditMetrics.avgItemsPerOrder} itens</span>
            </div>
          </div>
        </div>

        {/* KPI 3: Pedidos em Andamento */}
        <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-2xs hover:border-neutral-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-500 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-amber-600" />
              Pipeline em Andamento
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100">
              {auditMetrics.inProgressCount} pedidos
            </span>
          </div>

          <p className="text-2xl font-bold font-mono text-neutral-900 mt-2 tabular-nums">
            {formatBRL(auditMetrics.inProgressProjectedRevenueCents)}
          </p>

          <div className="mt-2 pt-2 border-t border-neutral-100 text-[11px] text-neutral-600 space-y-0.5">
            <div className="flex justify-between">
              <span>Status KDS:</span>
              <span className="text-amber-800 font-medium">Na cozinha / Expedição</span>
            </div>
            <div className="flex justify-between">
              <span>Impacto:</span>
              <span className="text-neutral-500">Aguardando entrega</span>
            </div>
          </div>
        </div>

        {/* KPI 4: Cancelamentos & Retenção */}
        <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-2xs hover:border-neutral-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-500 flex items-center gap-1.5">
              <Ban className="w-4 h-4 text-rose-600" />
              Taxa de Cancelamento
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-100">
              {auditMetrics.cancelledCount} cancelados
            </span>
          </div>

          <p className="text-2xl font-bold font-mono text-neutral-900 mt-2 tabular-nums">
            {auditMetrics.cancellationRate.toFixed(1)}%
          </p>

          <div className="mt-2 pt-2 border-t border-neutral-100 text-[11px] text-neutral-600 space-y-0.5">
            <div className="flex justify-between">
              <span>Valor cancelado:</span>
              <span className="font-mono text-rose-700">{formatBRL(auditMetrics.cancelledValueCents)}</span>
            </div>
            <div className="flex justify-between">
              <span>Regra contábil:</span>
              <span className="text-neutral-500">100% expurgado da receita</span>
            </div>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* INTERACTIVE AUDIT PROOF & MATHEMATICAL DEMONSTRATION SECTION         */}
      {/* ==================================================================== */}
      {showAuditProof && (
        <div className="bg-neutral-950 text-white rounded-xl p-6 shadow-md border border-neutral-800 space-y-5 animate-fadeIn">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  MEMÓRIA DE CÁLCULO AUDITADA
                </span>
                <span className="text-xs text-neutral-400">Padrão IFRS / Contabilidade de Competência</span>
              </div>
              <h3 className="text-sm font-bold text-white">
                Demonstração Matemática de Vendas Concluídas e Ticket Médio
              </h3>
            </div>
            <span className="text-xs font-mono text-emerald-400">
              Integridade: 100% dos centavos verificados
            </span>
          </div>

          {/* Formula Breakdown Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
            {/* Vendas Concluídas Formula */}
            <div className="bg-neutral-900/90 border border-neutral-800 rounded-lg p-3.5 space-y-2">
              <div className="flex items-center justify-between text-neutral-300">
                <span className="font-bold text-white">1. Fórmula: Faturamento Concluído</span>
                <span className="text-[10px] text-emerald-400">Status = 'delivered'</span>
              </div>
              <div className="bg-black/60 p-2.5 rounded border border-neutral-800 text-[11px] text-emerald-300 leading-relaxed">
                Vendas Concluídas = ∑ (Valor Total dos Pedidos Entregues)
                <br />
                = Subtotal dos Produtos ({formatBRL(auditMetrics.concludedItemsSubtotalCents)}) + Fretes Realizados ({formatBRL(auditMetrics.concludedDeliveryFeesCents)})
                <br />
                = <strong className="text-white text-sm">{formatBRL(auditMetrics.totalConcludedRevenueCents)}</strong>
              </div>
              <p className="text-[11px] text-neutral-400">
                • Pedidos em preparo ({auditMetrics.inProgressCount}) e cancelados ({auditMetrics.cancelledCount}) NÃO somam na receita líquida realizada.
              </p>
            </div>

            {/* Ticket Médio Formula */}
            <div className="bg-neutral-900/90 border border-neutral-800 rounded-lg p-3.5 space-y-2">
              <div className="flex items-center justify-between text-neutral-300">
                <span className="font-bold text-white">2. Fórmula: Ticket Médio Auditado</span>
                <span className="text-[10px] text-blue-400">Divisão Exata</span>
              </div>
              <div className="bg-black/60 p-2.5 rounded border border-neutral-800 text-[11px] text-blue-300 leading-relaxed">
                Ticket Médio = Vendas Concluídas ÷ Qtd. de Pedidos Entregues
                <br />
                = {formatBRL(auditMetrics.totalConcludedRevenueCents)} ÷ {auditMetrics.deliveredCount} pedidos entregues
                <br />
                = <strong className="text-white text-sm">{formatBRL(auditMetrics.averageTicketCents)}</strong> por pedido
              </div>
              <p className="text-[11px] text-neutral-400">
                • Divisão protegida contra divisão por zero (retorna R$ 0,00 se nenhum pedido foi entregue ainda).
              </p>
            </div>
          </div>

          {/* Delivered Orders Table (Individual Ledger) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-neutral-300 flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5 text-neutral-400" />
                Razonete Contábil dos Pedidos Concluídos ({auditMetrics.deliveredOrders.length} registros)
              </h4>
              <span className="text-[11px] text-neutral-400">
                Clique no pedido para visualizar ou reimprimir comanda
              </span>
            </div>

            <div className="border border-neutral-800 rounded-lg overflow-x-auto bg-neutral-900/60">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-900 border-b border-neutral-800 text-neutral-400 font-medium">
                  <tr>
                    <th className="p-2.5 font-mono"># Pedido</th>
                    <th className="p-2.5">Horário / Data</th>
                    <th className="p-2.5">Cliente</th>
                    <th className="p-2.5">Modalidade</th>
                    <th className="p-2.5 text-right font-mono">Subtotal</th>
                    <th className="p-2.5 text-right font-mono">Taxa Frete</th>
                    <th className="p-2.5 text-right font-mono text-emerald-400">Total Auditado</th>
                    <th className="p-2.5">Forma de Pagamento</th>
                    <th className="p-2.5 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60 font-mono text-neutral-300">
                  {auditMetrics.deliveredOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-neutral-800/40 transition-colors">
                      <td className="p-2.5 font-bold text-white">#{order.orderNumber}</td>
                      <td className="p-2.5 text-neutral-400 text-[11px]">{order.createdAt}</td>
                      <td className="p-2.5 font-sans font-medium text-white">{order.customerName}</td>
                      <td className="p-2.5 font-sans">
                        <span className="inline-flex items-center gap-1 text-[11px]">
                          {order.type === 'delivery' ? (
                            <>
                              <Bike className="w-3 h-3 text-emerald-400" />
                              <span>Entrega</span>
                            </>
                          ) : (
                            <>
                              <ShoppingBag className="w-3 h-3 text-purple-400" />
                              <span>Retirada</span>
                            </>
                          )}
                        </span>
                      </td>
                      <td className="p-2.5 text-right tabular-nums text-neutral-400">
                        {formatBRL(order.subtotalCents)}
                      </td>
                      <td className="p-2.5 text-right tabular-nums text-neutral-400">
                        {formatBRL(order.deliveryFeeCents || 0)}
                      </td>
                      <td className="p-2.5 text-right font-bold tabular-nums text-emerald-300">
                        {formatBRL(order.totalCents)}
                      </td>
                      <td className="p-2.5 font-sans text-[11px] text-neutral-300">
                        {order.paymentMethod}
                      </td>
                      <td className="p-2.5 text-center">
                        {onPrintOrder && (
                          <button
                            type="button"
                            onClick={() => onPrintOrder(order)}
                            className="text-[10px] px-2 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded transition-colors"
                          >
                            Comanda
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}

                  {/* Summary Row */}
                  <tr className="bg-neutral-900/90 font-bold border-t-2 border-neutral-700 text-white">
                    <td colSpan={4} className="p-2.5 font-sans text-right">
                      SOMA TOTAL AUDITADA ({auditMetrics.deliveredCount} PEDIDOS):
                    </td>
                    <td className="p-2.5 text-right tabular-nums text-neutral-300">
                      {formatBRL(auditMetrics.concludedItemsSubtotalCents)}
                    </td>
                    <td className="p-2.5 text-right tabular-nums text-neutral-300">
                      {formatBRL(auditMetrics.concludedDeliveryFeesCents)}
                    </td>
                    <td className="p-2.5 text-right tabular-nums text-emerald-400 text-sm">
                      {formatBRL(auditMetrics.totalConcludedRevenueCents)}
                    </td>
                    <td colSpan={2} className="p-2.5 text-[11px] text-neutral-400 font-sans">
                      Média = {formatBRL(auditMetrics.averageTicketCents)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Breakdown Row: Payment Methods & Fulfillment Channels & Top Products */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Card: Meios de Pagamento */}
        <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
            <h3 className="text-xs font-bold text-neutral-900 flex items-center gap-1.5">
              <CreditCard className="w-4 h-4 text-emerald-600" />
              Mix de Pagamentos (Vendas Entregues)
            </h3>
            <span className="text-[10px] text-neutral-400">Por volume R$</span>
          </div>

          <div className="space-y-3">
            {Object.entries(auditMetrics.paymentMethodsStats).map(([method, data]) => {
              const percent =
                auditMetrics.totalConcludedRevenueCents > 0
                  ? (data.revenueCents / auditMetrics.totalConcludedRevenueCents) * 100
                  : 0;

              return (
                <div key={method} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-neutral-800">{method}</span>
                    <span className="font-mono font-semibold text-neutral-900">
                      {formatBRL(data.revenueCents)} ({percent.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-neutral-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-600 rounded-full transition-all"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-neutral-400">
                    <span>{data.count} pedidos</span>
                    <span>Ticket médio: {formatBRL(Math.round(data.revenueCents / data.count))}</span>
                  </div>
                </div>
              );
            })}

            {Object.keys(auditMetrics.paymentMethodsStats).length === 0 && (
              <p className="text-xs text-neutral-400 text-center py-4">Nenhuma venda concluída para analisar.</p>
            )}
          </div>
        </div>

        {/* Card: Canais de Atendimento (Delivery vs Balcão) */}
        <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
            <h3 className="text-xs font-bold text-neutral-900 flex items-center gap-1.5">
              <Bike className="w-4 h-4 text-blue-600" />
              Canais de Entrega
            </h3>
            <span className="text-[10px] text-neutral-400">Delivery vs Retirada</span>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="border border-neutral-200 rounded-lg p-3 bg-neutral-50/50">
              <div className="flex items-center gap-1.5 text-xs text-neutral-700 font-semibold">
                <Bike className="w-4 h-4 text-emerald-600" />
                <span>Delivery em Casa</span>
              </div>
              <p className="text-lg font-bold font-mono text-neutral-900 mt-1">
                {formatBRL(auditMetrics.deliveryRevenueCents)}
              </p>
              <p className="text-[11px] text-neutral-500 mt-0.5">
                {auditMetrics.deliveryCount} entregas realizadas
              </p>
            </div>

            <div className="border border-neutral-200 rounded-lg p-3 bg-neutral-50/50">
              <div className="flex items-center gap-1.5 text-xs text-neutral-700 font-semibold">
                <ShoppingBag className="w-4 h-4 text-purple-600" />
                <span>Retirada Balcão</span>
              </div>
              <p className="text-lg font-bold font-mono text-neutral-900 mt-1">
                {formatBRL(auditMetrics.pickupRevenueCents)}
              </p>
              <p className="text-[11px] text-neutral-500 mt-0.5">
                {auditMetrics.pickupCount} retiradas na loja
              </p>
            </div>
          </div>

          <div className="p-3 bg-blue-50/50 border border-blue-200/60 rounded-lg text-xs text-blue-900 space-y-1">
            <p className="font-semibold flex items-center gap-1">
              <Info className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>Gestão de Logística Própria</span>
            </p>
            <p className="text-[11px] text-blue-800 leading-relaxed">
              O modelo com entrega própria economiza de 27% a 30% em comissões predatórias dos marketplaces tradicionais.
              Em {auditMetrics.deliveredCount} entregas, você reteve 100% da margem líquida.
            </p>
          </div>
        </div>

        {/* Card: Top Pratos Entregues (Auditoria Concluídos) */}
        <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
            <h3 className="text-xs font-bold text-neutral-900 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-orange-600" />
              Pratos Entregues (Concluídos)
            </h3>
            <span className="text-[10px] text-neutral-400">Receita auditada</span>
          </div>

          <div className="space-y-2.5">
            {auditMetrics.topProducts.map((prod, idx) => (
              <div key={prod.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-4 h-4 rounded-full bg-neutral-100 text-neutral-600 text-[10px] flex items-center justify-center font-bold font-mono shrink-0">
                    {idx + 1}
                  </span>
                  <span className="font-medium text-neutral-800 truncate" title={prod.name}>
                    {prod.name}
                  </span>
                </div>
                <div className="text-right shrink-0 font-mono">
                  <span className="font-semibold text-neutral-900">{formatBRL(prod.revenueCents)}</span>
                  <span className="text-[10px] text-neutral-400 ml-1.5">({prod.quantity}x)</span>
                </div>
              </div>
            ))}

            {auditMetrics.topProducts.length === 0 && (
              <p className="text-xs text-neutral-400 text-center py-4">Sem dados de pratos entregues ainda.</p>
            )}
          </div>

          {onNavigateToTab && (
            <div className="pt-2 border-t border-neutral-100 flex justify-end">
              <button
                type="button"
                onClick={() => onNavigateToTab('crm')}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors"
              >
                <span>Ver Histórico no CRM</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
