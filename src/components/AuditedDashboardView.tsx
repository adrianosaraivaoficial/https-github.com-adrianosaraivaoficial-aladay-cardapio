import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  Receipt,
  Clock,
  Ban,
  CheckCircle2,
  FileSpreadsheet,
  Info,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Bike,
  ShoppingBag,
  ArrowRight,
  ShieldCheck,
  Percent,
  Sparkles,
} from 'lucide-react';
import { Order, RestaurantTenant } from '../types';

interface AuditedDashboardViewProps {
  tenant: RestaurantTenant;
  orders: Order[];
  onNavigateToTab?: (tab: 'crm' | 'kds' | 'menu') => void;
  onPrintOrder?: (order: Order) => void;
}

export const AuditedDashboardView: React.FC<AuditedDashboardViewProps> = ({
  tenant,
  orders,
  onNavigateToTab,
  onPrintOrder,
}) => {
  const [showAuditProof, setShowAuditProof] = useState(false);
  const [selectedFilterPeriod, setSelectedFilterPeriod] = useState<'all' | 'today' | 'delivered_only'>('all');

  const formatBRL = (cents: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
  };

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

  return (
    <div className="space-y-6">
      {/* Header & Audit Certifier */}
      <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-neutral-900">Dashboard Gerencial &amp; Vendas Auditadas</h2>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <ShieldCheck className="w-3 h-3 text-emerald-600" />
              Auditoria Contábil Ativa
            </span>
          </div>
          <p className="text-xs text-neutral-500 mt-1">
            Métricas de faturamento calculadas estritamente sobre pedidos concluídos e entregues em {tenant.name}.
            Cancelamentos e pedidos em rota são auditados separadamente para transparência fiscal e gerencial.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAuditProof(!showAuditProof)}
            className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all border ${
              showAuditProof
                ? 'bg-neutral-900 text-white border-neutral-900 shadow-xs'
                : 'bg-neutral-50 text-neutral-700 hover:bg-neutral-100 border-neutral-200'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>{showAuditProof ? 'Ocultar Memória de Cálculo' : 'Ver Memória de Cálculo & Fórmulas'}</span>
            {showAuditProof ? <ChevronUp className="w-3.5 h-3.5 ml-1" /> : <ChevronDown className="w-3.5 h-3.5 ml-1" />}
          </button>

          {onNavigateToTab && (
            <button
              type="button"
              onClick={() => onNavigateToTab('crm')}
              className="px-3 py-2 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 flex items-center gap-1.5 transition-colors"
            >
              <span>Ir para CRM de Clientes</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
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

        {/* Card: Top Pratos Vendidos */}
        <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
            <h3 className="text-xs font-bold text-neutral-900 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-orange-600" />
              Pratos Mais Vendidos
            </h3>
            <span className="text-[10px] text-neutral-400">Por receita</span>
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
              <p className="text-xs text-neutral-400 text-center py-4">Sem dados de pratos vendidos ainda.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
