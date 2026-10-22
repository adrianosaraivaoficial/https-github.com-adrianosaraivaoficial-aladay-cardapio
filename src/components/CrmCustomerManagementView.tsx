import React, { useState, useMemo } from 'react';
import {
  Users,
  Search,
  Filter,
  MessageSquare,
  Receipt,
  Clock,
  MapPin,
  ShieldCheck,
  ShieldAlert,
  ArrowUpDown,
  Download,
  Calendar,
  CreditCard,
  Bike,
  ShoppingBag,
  ExternalLink,
  X,
  FileText,
  Printer,
  ChevronRight,
  Sparkles,
  Phone,
  UserCheck,
  Tag,
  AlertCircle,
} from 'lucide-react';
import { CustomerRecord, Order, RestaurantTenant } from '../types';

interface CrmCustomerManagementViewProps {
  tenant: RestaurantTenant;
  orders: Order[];
  customers: CustomerRecord[];
  onPrintOrder?: (order: Order) => void;
  onUpdateCustomerNote?: (customerId: string, note: string) => void;
}

interface ReconciledCustomer {
  id: string;
  name: string;
  phone: string;
  formattedPhone: string;
  ordersCount: number;
  deliveredOrdersCount: number;
  cancelledOrdersCount: number;
  totalSpentCents: number;
  deliveredLtvCents: number;
  averageTicketCents: number;
  firstOrderAt: string;
  lastOrderAt: string;
  lastDeliveryAddress?: string;
  marketingConsent: boolean;
  notes: string;
  tier: 'vip' | 'frequent' | 'new';
  orders: Order[];
}

export const CrmCustomerManagementView: React.FC<CrmCustomerManagementViewProps> = ({
  tenant,
  orders,
  customers,
  onPrintOrder,
  onUpdateCustomerNote,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [segmentFilter, setSegmentFilter] = useState<'all' | 'vip' | 'new' | 'optin' | 'optout'>('all');
  const [sortBy, setSortBy] = useState<'ltv' | 'orders' | 'recent' | 'name'>('ltv');
  const [selectedCustomer, setSelectedCustomer] = useState<ReconciledCustomer | null>(null);
  const [customerNotesState, setCustomerNotesState] = useState<Record<string, string>>({});
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [copyToast, setCopyToast] = useState<string | null>(null);

  const formatBRL = (cents: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
  };

  // Reconcile registered customers with live orders to guarantee complete, zero-data-loss customer registry
  const reconciledCustomers = useMemo<ReconciledCustomer[]>(() => {
    const customerMap = new Map<string, ReconciledCustomer>();

    // 1. Seed from registered customers prop
    customers.forEach((c) => {
      const cleanPhone = c.phone.replace(/\D/g, '');
      customerMap.set(cleanPhone, {
        id: c.id,
        name: c.name,
        phone: cleanPhone,
        formattedPhone: formatPhoneNumber(cleanPhone),
        ordersCount: 0,
        deliveredOrdersCount: 0,
        cancelledOrdersCount: 0,
        totalSpentCents: 0,
        deliveredLtvCents: 0,
        averageTicketCents: 0,
        firstOrderAt: c.firstOrderAt || 'Histórico anterior',
        lastOrderAt: c.lastOrderAt || 'Histórico anterior',
        marketingConsent: c.marketingConsent,
        notes: customerNotesState[c.id] ?? c.notes ?? '',
        tier: 'new',
        orders: [],
      });
    });

    // 2. Merge all orders for this tenant
    orders.forEach((order) => {
      const cleanPhone = (order.customerPhone || '').replace(/\D/g, '');
      if (!cleanPhone) return;

      let entry = customerMap.get(cleanPhone);
      if (!entry) {
        entry = {
          id: `cust_${cleanPhone}`,
          name: order.customerName || 'Cliente sem nome',
          phone: cleanPhone,
          formattedPhone: formatPhoneNumber(cleanPhone),
          ordersCount: 0,
          deliveredOrdersCount: 0,
          cancelledOrdersCount: 0,
          totalSpentCents: 0,
          deliveredLtvCents: 0,
          averageTicketCents: 0,
          firstOrderAt: order.createdAt,
          lastOrderAt: order.createdAt,
          marketingConsent: true,
          notes: customerNotesState[`cust_${cleanPhone}`] ?? '',
          tier: 'new',
          orders: [],
        };
        customerMap.set(cleanPhone, entry);
      }

      // Add order to history
      entry.orders.push(order);
      entry.ordersCount += 1;

      if (order.status === 'delivered') {
        entry.deliveredOrdersCount += 1;
        entry.deliveredLtvCents += order.totalCents;
      } else if (order.status === 'cancelled') {
        entry.cancelledOrdersCount += 1;
      }

      if (order.status !== 'cancelled') {
        entry.totalSpentCents += order.totalCents;
      }

      if (order.deliveryAddress) {
        entry.lastDeliveryAddress = order.deliveryAddress;
      }
      entry.lastOrderAt = order.createdAt;
    });

    // 3. Compute final metrics and tiers
    return Array.from(customerMap.values()).map((c) => {
      // Sort orders descending (most recent first)
      c.orders.sort((a, b) => b.orderNumber - a.orderNumber);

      const effectiveLtv = c.deliveredLtvCents > 0 ? c.deliveredLtvCents : c.totalSpentCents;
      const countForAvg = c.deliveredOrdersCount > 0 ? c.deliveredOrdersCount : c.ordersCount;
      const averageTicketCents = countForAvg > 0 ? Math.round(effectiveLtv / countForAvg) : 0;

      const tier: 'vip' | 'frequent' | 'new' =
        c.ordersCount >= 3 ? 'vip' : c.ordersCount === 2 ? 'frequent' : 'new';

      return {
        ...c,
        deliveredLtvCents: effectiveLtv,
        averageTicketCents,
        tier,
      };
    });
  }, [customers, orders, customerNotesState]);

  // Filters & Search
  const filteredCustomers = useMemo(() => {
    return reconciledCustomers
      .filter((c) => {
        const matchesSearch =
          searchQuery.trim() === '' ||
          c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.phone.includes(searchQuery.replace(/\D/g, '')) ||
          (c.lastDeliveryAddress && c.lastDeliveryAddress.toLowerCase().includes(searchQuery.toLowerCase()));

        if (!matchesSearch) return false;

        if (segmentFilter === 'vip') return c.tier === 'vip' || c.tier === 'frequent';
        if (segmentFilter === 'new') return c.tier === 'new';
        if (segmentFilter === 'optin') return c.marketingConsent === true;
        if (segmentFilter === 'optout') return c.marketingConsent === false;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'ltv') return b.deliveredLtvCents - a.deliveredLtvCents;
        if (sortBy === 'orders') return b.ordersCount - a.ordersCount;
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        return 0; // default order
      });
  }, [reconciledCustomers, searchQuery, segmentFilter, sortBy]);

  // Overall CRM metrics
  const crmSummary = useMemo(() => {
    const total = reconciledCustomers.length;
    const vipCount = reconciledCustomers.filter((c) => c.tier === 'vip' || c.tier === 'frequent').length;
    const totalDeliveredRevenue = reconciledCustomers.reduce((sum, c) => sum + c.deliveredLtvCents, 0);
    const avgLtv = total > 0 ? Math.round(totalDeliveredRevenue / total) : 0;
    const optInCount = reconciledCustomers.filter((c) => c.marketingConsent).length;
    const optInRate = total > 0 ? (optInCount / total) * 100 : 0;

    return { total, vipCount, avgLtv, optInRate };
  }, [reconciledCustomers]);

  // Handle Note Save
  const handleSaveNote = (customerId: string) => {
    setCustomerNotesState((prev) => ({
      ...prev,
      [customerId]: noteDraft,
    }));
    if (selectedCustomer) {
      setSelectedCustomer({ ...selectedCustomer, notes: noteDraft });
    }
    if (onUpdateCustomerNote) {
      onUpdateCustomerNote(customerId, noteDraft);
    }
    setIsEditingNote(false);
  };

  const handleOpenCustomerDetail = (cust: ReconciledCustomer) => {
    setSelectedCustomer(cust);
    setNoteDraft(cust.notes);
    setIsEditingNote(false);
  };

  const handleExportCsv = () => {
    const headers = ['Nome', 'WhatsApp', 'Total Pedidos', 'LTV (R$)', 'Ticket Médio (R$)', 'Último Pedido', 'LGPD Opt-In', 'Notas'];
    const rows = filteredCustomers.map((c) => [
      `"${c.name}"`,
      `"${c.phone}"`,
      c.ordersCount,
      (c.deliveredLtvCents / 100).toFixed(2),
      (c.averageTicketCents / 100).toFixed(2),
      `"${c.lastOrderAt}"`,
      c.marketingConsent ? 'SIM' : 'NÃO',
      `"${c.notes.replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `clientes_${tenant.slug}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setCopyToast('Relatório CSV de Clientes exportado com sucesso!');
    setTimeout(() => setCopyToast(null), 4000);
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {copyToast && (
        <div className="fixed bottom-4 right-4 z-50 bg-neutral-900 text-white px-4 py-2.5 rounded-lg shadow-lg text-xs font-medium animate-fadeIn flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <span>{copyToast}</span>
        </div>
      )}

      {/* Header & LGPD statement */}
      <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-neutral-900">Base de Clientes &amp; CRM Próprio</h2>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <ShieldCheck className="w-3 h-3 text-emerald-600" />
              Conforme LGPD (Lei 13.709/2018)
            </span>
          </div>
          <p className="text-xs text-neutral-500 mt-1">
            Dados 100% isolados da sua loja {tenant.name}. Consulte o histórico completo de pedidos de cada cliente,
            frequência de compras, LTV acumulado e entre em contato direto pelo WhatsApp.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            className="px-3 py-2 rounded-lg text-xs font-semibold bg-neutral-50 hover:bg-neutral-100 text-neutral-700 border border-neutral-200 flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-neutral-600" />
            <span>Exportar CSV</span>
          </button>
        </div>
      </div>

      {/* CRM Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-2xs">
          <span className="text-xs font-semibold text-neutral-500 flex items-center gap-1.5">
            <Users className="w-4 h-4 text-neutral-700" />
            Total de Clientes
          </span>
          <p className="text-2xl font-bold font-mono text-neutral-900 mt-2 tabular-nums">
            {crmSummary.total}
          </p>
          <p className="text-[11px] text-neutral-500 mt-1">Registrados na base do restaurante</p>
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-2xs">
          <span className="text-xs font-semibold text-neutral-500 flex items-center gap-1.5">
            <UserCheck className="w-4 h-4 text-purple-600" />
            Clientes VIP &amp; Recorrentes
          </span>
          <p className="text-2xl font-bold font-mono text-neutral-900 mt-2 tabular-nums">
            {crmSummary.vipCount}
          </p>
          <p className="text-[11px] text-neutral-500 mt-1">2 ou mais pedidos realizados</p>
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-2xs">
          <span className="text-xs font-semibold text-neutral-500 flex items-center gap-1.5">
            <Receipt className="w-4 h-4 text-emerald-600" />
            LTV Médio por Cliente
          </span>
          <p className="text-2xl font-bold font-mono text-neutral-900 mt-2 tabular-nums">
            {formatBRL(crmSummary.avgLtv)}
          </p>
          <p className="text-[11px] text-neutral-500 mt-1">Faturamento médio vitalício</p>
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-2xs">
          <span className="text-xs font-semibold text-neutral-500 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            Taxa de Opt-In LGPD
          </span>
          <p className="text-2xl font-bold font-mono text-neutral-900 mt-2 tabular-nums">
            {crmSummary.optInRate.toFixed(0)}%
          </p>
          <p className="text-[11px] text-neutral-500 mt-1">Autorizados para marketing no WhatsApp</p>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar cliente por nome, telefone ou endereço..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs border border-neutral-200 rounded-lg text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Segment Filter */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
            <span className="text-xs text-neutral-500 font-medium whitespace-nowrap">Segmento:</span>
            <div className="inline-flex rounded-lg border border-neutral-200 bg-neutral-50 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setSegmentFilter('all')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  segmentFilter === 'all' ? 'bg-white text-neutral-900 shadow-2xs' : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Todos ({reconciledCustomers.length})
              </button>
              <button
                type="button"
                onClick={() => setSegmentFilter('vip')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  segmentFilter === 'vip' ? 'bg-white text-purple-700 shadow-2xs font-semibold' : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                VIPs ({reconciledCustomers.filter((c) => c.tier === 'vip' || c.tier === 'frequent').length})
              </button>
              <button
                type="button"
                onClick={() => setSegmentFilter('new')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  segmentFilter === 'new' ? 'bg-white text-neutral-900 shadow-2xs' : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Novos ({reconciledCustomers.filter((c) => c.tier === 'new').length})
              </button>
              <button
                type="button"
                onClick={() => setSegmentFilter('optin')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  segmentFilter === 'optin' ? 'bg-white text-emerald-700 shadow-2xs font-semibold' : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                LGPD Opt-In
              </button>
            </div>
          </div>

          {/* Sort By */}
          <div className="flex items-center gap-2 shrink-0">
            <ArrowUpDown className="w-3.5 h-3.5 text-neutral-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="text-xs border border-neutral-200 rounded-lg px-2.5 py-1.5 bg-white text-neutral-800"
            >
              <option value="ltv">Ordenar: Maior LTV (R$)</option>
              <option value="orders">Ordenar: Mais Pedidos</option>
              <option value="name">Ordenar: Nome (A-Z)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Customer Listing Table */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-50/80 border-b border-neutral-200 text-neutral-600 font-semibold">
              <tr>
                <th className="p-3.5">Cliente</th>
                <th className="p-3.5">WhatsApp / Contato</th>
                <th className="p-3.5 text-center">Total Pedidos</th>
                <th className="p-3.5 text-right font-mono">LTV Concluído</th>
                <th className="p-3.5 text-right font-mono">Ticket Médio</th>
                <th className="p-3.5">Último Pedido</th>
                <th className="p-3.5 text-center">Status LGPD</th>
                <th className="p-3.5 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {filteredCustomers.map((cust) => (
                <tr
                  key={cust.id}
                  className="hover:bg-neutral-50/70 transition-colors group cursor-pointer"
                  onClick={() => handleOpenCustomerDetail(cust)}
                >
                  {/* Name & Tier */}
                  <td className="p-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-neutral-100 border border-neutral-200 flex items-center justify-center font-bold text-neutral-700 text-xs shrink-0">
                        {cust.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-neutral-900 group-hover:text-blue-600 transition-colors">
                            {cust.name}
                          </span>
                          {cust.tier === 'vip' && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                              VIP
                            </span>
                          )}
                          {cust.tier === 'frequent' && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-blue-100 text-blue-800 border border-blue-200">
                              Recorrente
                            </span>
                          )}
                        </div>
                        {cust.notes && (
                          <p className="text-[11px] text-neutral-500 truncate max-w-xs mt-0.5">
                            "{cust.notes}"
                          </p>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Phone & WhatsApp shortcut */}
                  <td className="p-3.5" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-neutral-700 text-[11px]">{cust.formattedPhone}</span>
                      <a
                        href={`https://wa.me/${cust.phone}?text=${encodeURIComponent(
                          `Olá ${cust.name.split(' ')[0]}! Tudo bem? Aqui é do ${tenant.name}. Estamos à sua disposição!`
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        title="Abrir conversa no WhatsApp"
                        className="p-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors border border-emerald-200 flex items-center justify-center"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </td>

                  {/* Orders count */}
                  <td className="p-3.5 text-center font-mono">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-neutral-100 font-semibold text-neutral-800 text-[11px]">
                      {cust.ordersCount} {cust.ordersCount === 1 ? 'pedido' : 'pedidos'}
                    </span>
                    {cust.cancelledOrdersCount > 0 && (
                      <p className="text-[10px] text-rose-600 mt-0.5">
                        ({cust.cancelledOrdersCount} cancelado)
                      </p>
                    )}
                  </td>

                  {/* LTV */}
                  <td className="p-3.5 text-right font-mono font-bold text-neutral-900 tabular-nums">
                    {formatBRL(cust.deliveredLtvCents)}
                  </td>

                  {/* Average Ticket */}
                  <td className="p-3.5 text-right font-mono text-neutral-700 tabular-nums">
                    {formatBRL(cust.averageTicketCents)}
                  </td>

                  {/* Last order date */}
                  <td className="p-3.5 text-neutral-600 text-[11px]">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-neutral-400" />
                      <span>{cust.lastOrderAt}</span>
                    </div>
                    {cust.lastDeliveryAddress && (
                      <p className="text-[10px] text-neutral-400 truncate max-w-xs mt-0.5">
                        📍 {cust.lastDeliveryAddress}
                      </p>
                    )}
                  </td>

                  {/* LGPD Status */}
                  <td className="p-3.5 text-center">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        cust.marketingConsent
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-neutral-100 text-neutral-600 border border-neutral-200'
                      }`}
                    >
                      {cust.marketingConsent ? (
                        <>
                          <ShieldCheck className="w-3 h-3 text-emerald-600" />
                          <span>Opt-in Ativo</span>
                        </>
                      ) : (
                        <>
                          <ShieldAlert className="w-3 h-3 text-neutral-400" />
                          <span>Apenas Transacional</span>
                        </>
                      )}
                    </span>
                  </td>

                  {/* Action */}
                  <td className="p-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => handleOpenCustomerDetail(cust)}
                      className="px-2.5 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200 flex items-center gap-1 mx-auto transition-colors"
                    >
                      <span>Ver Histórico</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}

              {filteredCustomers.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-neutral-400 text-xs">
                    Nenhum cliente encontrado com os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* ISOLATED CUSTOMER ORDER HISTORY DRAWER / MODAL                       */}
      {/* ==================================================================== */}
      {selectedCustomer && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-end p-0 backdrop-blur-2xs animate-fadeIn">
          <div className="bg-white h-full w-full max-w-2xl flex flex-col shadow-2xl overflow-hidden border-l border-neutral-200 animate-slideLeft">
            {/* Drawer Header */}
            <div className="p-5 border-b border-neutral-200 bg-neutral-50/80 flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-full bg-neutral-900 text-white font-bold flex items-center justify-center text-sm">
                    {selectedCustomer.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-neutral-900">{selectedCustomer.name}</h3>
                      {selectedCustomer.tier === 'vip' && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                          Cliente VIP
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-neutral-600 mt-0.5">
                      <span className="font-mono">{selectedCustomer.formattedPhone}</span>
                      <span>•</span>
                      <span>{selectedCustomer.ordersCount} pedidos na loja</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={`https://wa.me/${selectedCustomer.phone}?text=${encodeURIComponent(
                    `Olá ${selectedCustomer.name.split(' ')[0]}! Tudo bem? Aqui é da equipe ${tenant.name}. Como posso ajudar?`
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 shadow-xs transition-colors"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>WhatsApp</span>
                </a>
                <button
                  type="button"
                  onClick={() => setSelectedCustomer(null)}
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {/* Financial & Profile Summary */}
              <div className="grid grid-cols-3 gap-3 bg-neutral-50 p-4 rounded-xl border border-neutral-200 text-xs">
                <div>
                  <span className="text-[11px] text-neutral-500 font-medium">LTV Realizado</span>
                  <p className="text-base font-bold font-mono text-neutral-900 mt-0.5">
                    {formatBRL(selectedCustomer.deliveredLtvCents)}
                  </p>
                  <p className="text-[10px] text-emerald-700 font-medium mt-0.5">
                    {selectedCustomer.deliveredOrdersCount} pedidos concluídos
                  </p>
                </div>
                <div>
                  <span className="text-[11px] text-neutral-500 font-medium">Ticket Médio</span>
                  <p className="text-base font-bold font-mono text-neutral-900 mt-0.5">
                    {formatBRL(selectedCustomer.averageTicketCents)}
                  </p>
                  <p className="text-[10px] text-neutral-500 mt-0.5">por pedido concluído</p>
                </div>
                <div>
                  <span className="text-[11px] text-neutral-500 font-medium">Consentimento LGPD</span>
                  <p className="text-xs font-semibold mt-1">
                    {selectedCustomer.marketingConsent ? (
                      <span className="text-emerald-700 flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Opt-in Ativo
                      </span>
                    ) : (
                      <span className="text-neutral-600 flex items-center gap-1">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        Apenas Transacional
                      </span>
                    )}
                  </p>
                  <p className="text-[10px] text-neutral-400 mt-0.5">100% isolado na loja</p>
                </div>
              </div>

              {/* Delivery Address if present */}
              {selectedCustomer.lastDeliveryAddress && (
                <div className="p-3 bg-blue-50/50 border border-blue-200/60 rounded-lg text-xs flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-blue-900">Endereço de Entrega Frequente:</span>
                    <p className="text-blue-800 text-[11px] mt-0.5">{selectedCustomer.lastDeliveryAddress}</p>
                  </div>
                </div>
              )}

              {/* Customer Internal CRM Notes */}
              <div className="border border-neutral-200 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-neutral-500" />
                    Notas Internas do Restaurante (Visível apenas para equipe)
                  </span>
                  {!isEditingNote && (
                    <button
                      type="button"
                      onClick={() => setIsEditingNote(true)}
                      className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold"
                    >
                      {selectedCustomer.notes ? 'Editar nota' : '+ Adicionar nota'}
                    </button>
                  )}
                </div>

                {isEditingNote ? (
                  <div className="space-y-2 pt-1">
                    <textarea
                      rows={3}
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      placeholder="Ex: Cliente VIP, prefere ponto ao ponto, alérgico a camarão..."
                      className="w-full p-2.5 text-xs border border-neutral-200 rounded-lg text-neutral-900"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setIsEditingNote(false)}
                        className="px-2.5 py-1 text-xs text-neutral-600 hover:text-neutral-800"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveNote(selectedCustomer.id)}
                        className="px-3 py-1 text-xs font-semibold bg-neutral-900 text-white rounded hover:bg-neutral-800"
                      >
                        Salvar Nota
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-neutral-600 bg-neutral-50 p-2.5 rounded-lg border border-neutral-100 italic">
                    {selectedCustomer.notes || 'Nenhuma observação interna cadastrada para este cliente.'}
                  </p>
                )}
              </div>

              {/* ISOLATED ORDER HISTORY TIMELINE */}
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-1 border-b border-neutral-200">
                  <h4 className="text-xs font-bold text-neutral-900 flex items-center gap-1.5">
                    <Receipt className="w-4 h-4 text-neutral-700" />
                    Histórico Cronológico de Pedidos ({selectedCustomer.orders.length})
                  </h4>
                  <span className="text-[11px] text-neutral-400">
                    Exibição detalhada com itens e valores
                  </span>
                </div>

                <div className="space-y-4">
                  {selectedCustomer.orders.map((order) => {
                    const statusConfig = getStatusBadge(order.status);

                    return (
                      <div
                        key={order.id}
                        className="border border-neutral-200 rounded-xl p-4 bg-white shadow-2xs hover:border-neutral-300 transition-colors space-y-3"
                      >
                        {/* Order Header */}
                        <div className="flex items-start justify-between">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono font-bold text-neutral-900">
                                Pedido #{order.orderNumber}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 ${statusConfig.badgeClass}`}
                              >
                                {statusConfig.label}
                              </span>
                            </div>
                            <p className="text-[11px] text-neutral-500 font-mono">
                              {order.createdAt} • {order.type === 'delivery' ? '🛵 Entrega' : '🛍️ Retirada no balcão'}
                            </p>
                          </div>

                          <div className="text-right">
                            <span className="text-sm font-bold font-mono text-neutral-900 tabular-nums">
                              {formatBRL(order.totalCents)}
                            </span>
                            <p className="text-[10px] text-neutral-400 font-mono">
                              {order.paymentMethod}
                            </p>
                          </div>
                        </div>

                        {/* Order Items Table / List */}
                        <div className="bg-neutral-50/70 border border-neutral-200/80 rounded-lg p-3 space-y-2 text-xs">
                          <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block">
                            Itens do Pedido:
                          </span>
                          <div className="space-y-1.5 divide-y divide-neutral-100">
                            {order.items.map((item, idx) => (
                              <div key={idx} className="pt-1.5 first:pt-0 flex items-start justify-between">
                                <div className="space-y-0.5 pr-2">
                                  <p className="font-semibold text-neutral-900">
                                    {item.quantity}x {item.productName}
                                  </p>
                                  {item.selectedOptions && item.selectedOptions.length > 0 && (
                                    <p className="text-[11px] text-neutral-500">
                                      Opções: {item.selectedOptions.map((opt) => opt.itemName).join(', ')}
                                    </p>
                                  )}
                                  {item.notes && (
                                    <p className="text-[11px] text-amber-800 italic">
                                      Obs: "{item.notes}"
                                    </p>
                                  )}
                                </div>
                                <span className="font-mono text-neutral-700 shrink-0">
                                  {formatBRL(item.totalCents)}
                                </span>
                              </div>
                            ))}
                          </div>

                          {/* Subtotals & Delivery Fee breakdown */}
                          <div className="pt-2 border-t border-neutral-200 flex justify-between text-[11px] text-neutral-600 font-mono">
                            <span>Subtotal: {formatBRL(order.subtotalCents)}</span>
                            <span>Frete: {formatBRL(order.deliveryFeeCents || 0)}</span>
                            <span className="font-bold text-neutral-900">Total: {formatBRL(order.totalCents)}</span>
                          </div>
                        </div>

                        {/* Order Address if Delivery */}
                        {order.deliveryAddress && (
                          <div className="text-[11px] text-neutral-600 flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                            <span className="truncate">{order.deliveryAddress}</span>
                          </div>
                        )}

                        {/* Order Actions: Thermal Print & WhatsApp Log */}
                        <div className="pt-2 border-t border-neutral-100 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1 text-[11px] text-neutral-500 font-mono">
                            <Clock className="w-3 h-3 text-neutral-400" />
                            <span>
                              {order.whatsAppLogs && order.whatsAppLogs.length > 0
                                ? `Notificação WhatsApp: ${order.whatsAppLogs[order.whatsAppLogs.length - 1].detail}`
                                : 'Notificação Evolution API enviada'}
                            </span>
                          </div>

                          {onPrintOrder && (
                            <button
                              type="button"
                              onClick={() => onPrintOrder(order)}
                              className="px-2.5 py-1 text-[11px] font-semibold text-neutral-700 hover:text-neutral-900 bg-neutral-100 hover:bg-neutral-200 rounded flex items-center gap-1 transition-colors"
                            >
                              <Printer className="w-3 h-3 text-neutral-600" />
                              <span>Imprimir Comanda</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {selectedCustomer.orders.length === 0 && (
                    <div className="p-8 text-center text-neutral-400 text-xs border border-dashed border-neutral-200 rounded-xl">
                      Nenhum pedido registrado no sistema para este cliente até o momento.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper: Format Brazilian Phone Number nicely
function formatPhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('55')) {
    // 55 11 98765-4321
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  return phone;
}

// Helper: Status Badges for Orders
function getStatusBadge(status: string): { label: string; badgeClass: string } {
  switch (status) {
    case 'delivered':
      return { label: 'Entregue com Sucesso', badgeClass: 'bg-emerald-100 text-emerald-800 border border-emerald-200' };
    case 'ready':
      return { label: 'Pronto / Despachado', badgeClass: 'bg-purple-100 text-purple-800 border border-purple-200' };
    case 'preparing':
      return { label: 'Em Preparo na Cozinha', badgeClass: 'bg-blue-100 text-blue-800 border border-blue-200' };
    case 'confirmed':
      return { label: 'Confirmado pelo Lojista', badgeClass: 'bg-indigo-100 text-indigo-800 border border-indigo-200' };
    case 'received':
      return { label: 'Recebido (Pendente)', badgeClass: 'bg-amber-100 text-amber-800 border border-amber-200' };
    case 'cancelled':
      return { label: 'Cancelado', badgeClass: 'bg-rose-100 text-rose-800 border border-rose-200' };
    default:
      return { label: status, badgeClass: 'bg-neutral-100 text-neutral-800' };
  }
}
