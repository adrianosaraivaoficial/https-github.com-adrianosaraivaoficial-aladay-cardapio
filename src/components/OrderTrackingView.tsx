import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  Clock,
  ChefHat,
  Bike,
  PackageCheck,
  AlertCircle,
  MessageSquare,
  Printer,
  ChevronRight,
  Phone,
  MapPin,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Send,
  Sparkles,
  Share2,
  Copy,
  Check,
  Zap,
  QrCode
} from 'lucide-react';
import { Order, OrderStatus, RestaurantTenant } from '../types';
import { ThermalTicketModal } from './ThermalTicketModal';
import { PixPaymentModal } from './PixPaymentModal';

interface OrderTrackingViewProps {
  order: Order;
  tenant: RestaurantTenant;
  onUpdateOrderStatus?: (orderId: string, nextStatus: OrderStatus) => void;
  onBackToMenu?: () => void;
}

export const OrderTrackingView: React.FC<OrderTrackingViewProps> = ({
  order: initialOrder,
  tenant,
  onUpdateOrderStatus,
  onBackToMenu,
}) => {
  const [order, setOrder] = useState<Order>(initialOrder);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showThermalModal, setShowThermalModal] = useState(false);
  const [showPixModal, setShowPixModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Sync if prop updates
  useEffect(() => {
    setOrder(initialOrder);
  }, [initialOrder]);

  // Status mapping and configuration
  const statusConfig: Record<
    OrderStatus,
    {
      title: string;
      subtitle: string;
      color: string;
      bgBadge: string;
      icon: React.ReactNode;
      progressPercent: number;
    }
  > = {
    received: {
      title: 'Pedido Recebido',
      subtitle: 'Aguardando confirmação e liberação para a cozinha',
      color: 'text-blue-600',
      bgBadge: 'bg-blue-100 text-blue-800 border-blue-200',
      icon: <Clock className="w-5 h-5 text-blue-600 animate-pulse" />,
      progressPercent: 20,
    },
    confirmed: {
      title: 'Pedido Confirmado',
      subtitle: 'Aprovado pelo restaurante. Entrando na fila de produção',
      color: 'text-indigo-600',
      bgBadge: 'bg-indigo-100 text-indigo-800 border-indigo-200',
      icon: <CheckCircle2 className="w-5 h-5 text-indigo-600" />,
      progressPercent: 40,
    },
    preparing: {
      title: 'Em Preparo na Cozinha',
      subtitle: 'Nossos cozinheiros estão preparando seus itens com muito cuidado',
      color: 'text-amber-600',
      bgBadge: 'bg-amber-100 text-amber-800 border-amber-200',
      icon: <ChefHat className="w-5 h-5 text-amber-600" />,
      progressPercent: 65,
    },
    ready: {
      title: order.type === 'delivery' ? 'Saiu para Entrega!' : 'Pronto para Retirada!',
      subtitle:
        order.type === 'delivery'
          ? 'O motoboy já está em rota para o seu endereço'
          : 'Seu pedido está embalado te esperando no balcão',
      color: 'text-purple-600',
      bgBadge: 'bg-purple-100 text-purple-800 border-purple-200',
      icon: <Bike className="w-5 h-5 text-purple-600" />,
      progressPercent: 88,
    },
    delivered: {
      title: order.type === 'delivery' ? 'Pedido Entregue!' : 'Pedido Concluído!',
      subtitle: 'Esperamos que você adore sua refeição. Bom apetite!',
      color: 'text-emerald-600',
      bgBadge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      icon: <PackageCheck className="w-5 h-5 text-emerald-600" />,
      progressPercent: 100,
    },
    cancelled: {
      title: 'Pedido Cancelado',
      subtitle: 'Este pedido foi cancelado pelo restaurante ou cliente',
      color: 'text-red-600',
      bgBadge: 'bg-red-100 text-red-800 border-red-200',
      icon: <AlertCircle className="w-5 h-5 text-red-600" />,
      progressPercent: 0,
    },
  };

  const currentCfg = statusConfig[order.status] || statusConfig.received;

  // Timeline definition
  const timeline = [
    {
      id: 'received',
      name: 'Pedido Recebido',
      desc: 'Registrado às ' + (order.createdAt || '12:00'),
      done: ['received', 'confirmed', 'preparing', 'ready', 'delivered'].includes(order.status),
      active: order.status === 'received',
    },
    {
      id: 'confirmed',
      name: 'Confirmado',
      desc: 'Aceito pela equipe',
      done: ['confirmed', 'preparing', 'ready', 'delivered'].includes(order.status),
      active: order.status === 'confirmed',
    },
    {
      id: 'preparing',
      name: 'Na Cozinha',
      desc: 'Em preparação artesanal',
      done: ['preparing', 'ready', 'delivered'].includes(order.status),
      active: order.status === 'preparing',
    },
    {
      id: 'ready',
      name: order.type === 'delivery' ? 'A Caminho' : 'Pronto',
      desc: order.type === 'delivery' ? 'Com o motoboy' : 'No balcão',
      done: ['ready', 'delivered'].includes(order.status),
      active: order.status === 'ready',
    },
    {
      id: 'delivered',
      name: 'Concluído',
      desc: 'Entregue com sucesso',
      done: order.status === 'delivered',
      active: order.status === 'delivered',
    },
  ];

  // Advance status handler (Simulation & Real API)
  const handleAdvanceStatus = async (nextStatus: OrderStatus) => {
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/v1/orders/${order.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (res.ok) {
        const json = await res.json();
        setOrder(json.data);
        if (onUpdateOrderStatus) {
          onUpdateOrderStatus(order.id, nextStatus);
        }
        setToastMessage(
          `Notificação WhatsApp do status "${nextStatus}" despachada via Evolution API para ${order.customerPhone}!`
        );
      } else {
        // Fallback local update
        setOrder((prev) => ({
          ...prev,
          status: nextStatus,
          updatedAt: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        }));
        if (onUpdateOrderStatus) {
          onUpdateOrderStatus(order.id, nextStatus);
        }
      }
    } catch {
      setOrder((prev) => ({
        ...prev,
        status: nextStatus,
        updatedAt: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      }));
      if (onUpdateOrderStatus) {
        onUpdateOrderStatus(order.id, nextStatus);
      }
    } finally {
      setIsUpdating(false);
      setTimeout(() => setToastMessage(null), 4500);
    }
  };

  const handleCopyTrackingLink = () => {
    const url = window.location.origin + `/pedido/${order.id}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 3000);
  };

  // WhatsApp chat link directly to restaurant
  const waContactUrl = `https://wa.me/${tenant.phone}?text=${encodeURIComponent(
    `Olá! Gostaria de falar sobre o meu pedido #${order.orderNumber} realizado no cardápio digital do ${tenant.name}.`
  )}`;

  return (
    <div className="min-h-screen bg-neutral-100 py-6 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto space-y-5">
        {/* Toast Alert */}
        {toastMessage && (
          <div className="fixed top-4 right-4 z-50 bg-neutral-900 text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-3 border border-neutral-700 animate-in fade-in slide-in-from-top-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
            <span className="font-medium">{toastMessage}</span>
          </div>
        )}

        {/* Top Bar with Brand & Return */}
        <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-neutral-200 shadow-2xs">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white text-sm shadow-xs"
              style={{ backgroundColor: tenant.primaryColor }}
            >
              {tenant.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h2 className="text-sm font-bold text-neutral-900">{tenant.name}</h2>
              <p className="text-[11px] text-neutral-500">Rastreamento de Pedido em Tempo Real</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onBackToMenu && (
              <button
                type="button"
                onClick={onBackToMenu}
                className="px-3 py-1.5 text-xs text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors font-medium"
              >
                ← Voltar ao Cardápio
              </button>
            )}
            <button
              type="button"
              onClick={handleCopyTrackingLink}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-medium rounded-lg transition-colors"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedLink ? 'Link Copiado!' : 'Copiar Link'}</span>
            </button>
          </div>
        </div>

        {/* Interactive Simulation Strip (For Demo & Verification) */}
        <div className="bg-gradient-to-r from-neutral-900 to-neutral-800 text-neutral-100 p-4 rounded-xl shadow-md space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span className="font-bold">Simulador de Ciclo de Vida do Pedido (KDS ➔ WhatsApp):</span>
            </div>
            <span className="text-[11px] text-neutral-400 font-mono">
              Instância Evolution: <code className="text-emerald-400 font-bold">{tenant.evolutionInstanceId || 'aladay'}</code>
            </span>
          </div>
          <p className="text-[11px] text-neutral-300">
            Clique nos botões abaixo para simular a mudança de status na cozinha e ver a notificação automática disparando para o WhatsApp de <strong>{order.customerName} ({order.customerPhone})</strong>:
          </p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            <button
              type="button"
              disabled={isUpdating}
              onClick={() => handleAdvanceStatus('received')}
              className={`px-3 py-1 rounded text-[11px] font-semibold transition-all ${
                order.status === 'received'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-neutral-700 hover:bg-neutral-600 text-neutral-200'
              }`}
            >
              1. Recebido
            </button>
            <button
              type="button"
              disabled={isUpdating}
              onClick={() => handleAdvanceStatus('confirmed')}
              className={`px-3 py-1 rounded text-[11px] font-semibold transition-all ${
                order.status === 'confirmed'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-neutral-700 hover:bg-neutral-600 text-neutral-200'
              }`}
            >
              2. Confirmado
            </button>
            <button
              type="button"
              disabled={isUpdating}
              onClick={() => handleAdvanceStatus('preparing')}
              className={`px-3 py-1 rounded text-[11px] font-semibold transition-all ${
                order.status === 'preparing'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-neutral-700 hover:bg-neutral-600 text-neutral-200'
              }`}
            >
              3. Na Cozinha
            </button>
            <button
              type="button"
              disabled={isUpdating}
              onClick={() => handleAdvanceStatus('ready')}
              className={`px-3 py-1 rounded text-[11px] font-semibold transition-all ${
                order.status === 'ready'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'bg-neutral-700 hover:bg-neutral-600 text-neutral-200'
              }`}
            >
              4. A Caminho / Pronto
            </button>
            <button
              type="button"
              disabled={isUpdating}
              onClick={() => handleAdvanceStatus('delivered')}
              className={`px-3 py-1 rounded text-[11px] font-semibold transition-all ${
                order.status === 'delivered'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-neutral-700 hover:bg-neutral-600 text-neutral-200'
              }`}
            >
              5. Concluído
            </button>

            <button
              type="button"
              disabled={isUpdating}
              onClick={async () => {
                setIsUpdating(true);
                try {
                  const res = await fetch('/api/v1/pix/simulate-payment', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ orderId: order.id }),
                  });
                  if (res.ok) {
                    const json = await res.json();
                    if (json.data?.order) {
                      setOrder(json.data.order);
                    }
                    setToastMessage('⚡ Baixa Pix via Webhook confirmada! Pedido liberado para a cozinha.');
                    setTimeout(() => setToastMessage(null), 5000);
                  }
                } catch (e) {
                  console.error(e);
                } finally {
                  setIsUpdating(false);
                }
              }}
              className="px-3 py-1 rounded text-[11px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1 shadow-xs transition-all ml-auto"
              title="Simular que o cliente pagou o Pix no banco e disparar webhook"
            >
              <Zap className="w-3 h-3 fill-current text-amber-300" />
              <span>⚡ Simular Baixa Pix Webhook</span>
            </button>
          </div>
        </div>

        {/* Main Status Hero Banner */}
        <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-sm space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-neutral-100">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold bg-neutral-100 text-neutral-800 px-2 py-0.5 rounded">
                  Pedido #{order.orderNumber}
                </span>
                <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${currentCfg.bgBadge}`}>
                  {currentCfg.title}
                </span>
              </div>
              <h1 className="text-xl font-bold text-neutral-900 mt-2">{currentCfg.title}</h1>
              <p className="text-xs text-neutral-500 mt-0.5">{currentCfg.subtitle}</p>
            </div>

            <div className="text-right">
              <span className="text-[11px] text-neutral-400 block">Tempo estimado:</span>
              <span className="text-2xl font-black text-neutral-900 font-mono">
                {order.status === 'delivered' ? 'Finalizado' : '25 ~ 40 min'}
              </span>
              <span className="text-[10px] text-neutral-500 block">
                Última atualização: {order.updatedAt || order.createdAt}
              </span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px] font-medium text-neutral-500">
              <span>Progresso</span>
              <span className="font-mono">{currentCfg.progressPercent}%</span>
            </div>
            <div className="h-2.5 w-full bg-neutral-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-full transition-all duration-700"
                style={{ width: `${currentCfg.progressPercent}%` }}
              />
            </div>
          </div>

          {/* Stepper Timeline */}
          <div className="grid grid-cols-5 gap-2 pt-2">
            {timeline.map((step, idx) => (
              <div key={step.id} className="flex flex-col items-center text-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs mb-1.5 transition-all ${
                    step.active
                      ? 'bg-neutral-900 text-white ring-4 ring-neutral-200'
                      : step.done
                      ? 'bg-emerald-600 text-white'
                      : 'bg-neutral-100 text-neutral-400 border border-neutral-300'
                  }`}
                >
                  {step.done ? <Check className="w-4 h-4" /> : idx + 1}
                </div>
                <span
                  className={`text-[11px] font-semibold leading-tight line-clamp-1 ${
                    step.active ? 'text-neutral-900' : step.done ? 'text-emerald-700' : 'text-neutral-400'
                  }`}
                >
                  {step.name}
                </span>
                <span className="text-[9px] text-neutral-400 hidden sm:block mt-0.5">{step.desc}</span>
              </div>
            ))}
          </div>
        </div>

        {/* WhatsApp Notification Stream (Auditoria ao Vivo da Evolution API) */}
        <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                <MessageSquare className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-neutral-900">
                  Notificações Despachadas no WhatsApp do Cliente
                </h3>
                <p className="text-[11px] text-neutral-500">
                  Mensagens enviadas automaticamente para <strong className="text-neutral-800">+{order.customerPhone}</strong> via Evolution API
                </p>
              </div>
            </div>

            <span className="text-[10px] bg-emerald-100 text-emerald-800 font-mono font-bold px-2 py-0.5 rounded-full">
              Instância: {tenant.evolutionInstanceId || 'aladay'}
            </span>
          </div>

          {order.whatsAppLogs && order.whatsAppLogs.length > 0 ? (
            <div className="space-y-3">
              {order.whatsAppLogs.map((log, idx) => (
                <div
                  key={idx}
                  className="p-3.5 bg-neutral-50 border border-neutral-200 rounded-xl space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-neutral-400">{log.timestamp}</span>
                      <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-mono font-semibold text-[10px]">
                        Evolution API · 200 OK
                      </span>
                    </div>
                    <span className="text-neutral-500 font-medium">{log.event}</span>
                  </div>

                  <p className="text-neutral-700 text-xs">{log.detail}</p>

                  {log.messageText && (
                    <div className="bg-[#DCF8C6]/60 border border-emerald-200 p-3 rounded-lg font-mono text-[11px] text-neutral-900 whitespace-pre-wrap leading-relaxed">
                      {log.messageText}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 text-center text-xs text-neutral-500 bg-neutral-50 rounded-xl border border-dashed border-neutral-300">
              Nenhuma notificação registrada ainda. Use o simulador acima para avançar o status e disparar a mensagem.
            </div>
          )}
        </div>

        {/* Order Details & Summary Card */}
        <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
            <h3 className="text-sm font-bold text-neutral-900">Resumo do Pedido</h3>
            <button
              type="button"
              onClick={() => setShowThermalModal(true)}
              className="flex items-center gap-1.5 text-xs text-neutral-700 hover:text-neutral-900 bg-neutral-100 hover:bg-neutral-200 px-3 py-1.5 rounded-lg font-medium transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Ver Comanda Térmica</span>
            </button>
          </div>

          {/* Delivery & Customer Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs bg-neutral-50 p-4 rounded-xl border border-neutral-200">
            <div className="space-y-1">
              <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider block">
                Cliente &amp; Contato
              </span>
              <p className="font-bold text-neutral-900">{order.customerName}</p>
              <p className="text-neutral-600 font-mono">+{order.customerPhone}</p>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider block">
                {order.type === 'delivery' ? 'Endereço de Entrega' : 'Tipo de Pedido'}
              </span>
              {order.type === 'delivery' ? (
                <>
                  <p className="font-semibold text-neutral-900 flex items-start gap-1">
                    <MapPin className="w-3.5 h-3.5 text-neutral-500 shrink-0 mt-0.5" />
                    <span>{order.deliveryAddress || 'Endereço informado no checkout'}</span>
                  </p>
                  {order.deliveryZoneName && (
                    <span className="inline-block text-[10px] bg-neutral-200 text-neutral-800 px-1.5 py-0.5 rounded font-medium">
                      Bairro: {order.deliveryZoneName}
                    </span>
                  )}
                </>
              ) : (
                <p className="font-semibold text-neutral-900">Retirada no Balcão do Restaurante</p>
              )}
            </div>
          </div>

          {/* Items List */}
          <div className="space-y-3">
            <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider block">
              Itens Pedidos ({order.items.length})
            </span>
            <div className="divide-y divide-neutral-100">
              {order.items.map((item, idx) => (
                <div key={idx} className="py-2.5 flex items-start justify-between gap-3 text-xs">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded bg-neutral-900 text-white flex items-center justify-center font-bold text-[10px]">
                        {item.quantity}x
                      </span>
                      <span className="font-bold text-neutral-900">{item.productName}</span>
                    </div>

                    {item.selectedOptions && item.selectedOptions.length > 0 && (
                      <div className="pl-7 space-y-0.5 text-[11px] text-neutral-500">
                        {item.selectedOptions.map((opt, optIdx) => (
                          <div key={optIdx} className="flex items-center gap-1">
                            <span>• {opt.itemName}</span>
                            {opt.priceCents > 0 && (
                              <span className="font-mono text-neutral-700">
                                (+R$ {(opt.priceCents / 100).toFixed(2).replace('.', ',')})
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {item.notes && (
                      <p className="pl-7 text-[11px] text-amber-700 italic">
                        Obs: &quot;{item.notes}&quot;
                      </p>
                    )}
                  </div>

                  <span className="font-mono font-bold text-neutral-900 shrink-0">
                    R$ {(item.totalCents / 100).toFixed(2).replace('.', ',')}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Financial Breakdown */}
          <div className="border-t border-neutral-100 pt-3 space-y-1.5 text-xs">
            <div className="flex justify-between text-neutral-600">
              <span>Subtotal dos Itens</span>
              <span className="font-mono">R$ {(order.subtotalCents / 100).toFixed(2).replace('.', ',')}</span>
            </div>
            <div className="flex justify-between text-neutral-600">
              <span>Taxa de Entrega</span>
              <span className="font-mono">
                {order.deliveryFeeCents > 0
                  ? `R$ ${(order.deliveryFeeCents / 100).toFixed(2).replace('.', ',')}`
                  : 'Grátis (Retirada)'}
              </span>
            </div>
            <div className="flex justify-between text-base font-bold text-neutral-900 pt-2 border-t border-neutral-100">
              <span>Valor Total</span>
              <span className="font-mono text-emerald-700">
                R$ {(order.totalCents / 100).toFixed(2).replace('.', ',')}
              </span>
            </div>
            <div className="flex justify-between items-center pt-1 text-[11px] text-neutral-500">
              <span>Forma de Pagamento:</span>
              <span className={`font-semibold flex items-center gap-1 ${
                order.paymentStatus === 'paid_online' ? 'text-emerald-700 font-bold' : 'text-neutral-800'
              }`}>
                {order.paymentStatus === 'paid_online' && <Zap className="w-3 h-3 text-emerald-600 fill-current" />}
                {order.paymentStatus === 'paid_online' ? '⚡ Pix Pago Online (Aprovado)' : order.paymentMethod}
              </span>
            </div>

            {/* Pix Status Banner */}
            {order.paymentStatus === 'paid_online' ? (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-800">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Pagamento Pix liquidado via Webhook com baixa automática no KDS.</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPixModal(true)}
                  className="text-[10px] text-emerald-700 hover:text-emerald-900 font-bold underline"
                >
                  Ver Comprovante
                </button>
              </div>
            ) : order.paymentMethod.includes('Pix') ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs text-amber-900">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Aguardando liquidação do Pix no seu banco.</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPixModal(true)}
                  className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-[11px] font-bold shadow-2xs"
                >
                  Abrir QR Code Pix
                </button>
              </div>
            ) : null}
          </div>

          {/* Customer Action: Contact Restaurant */}
          <div className="pt-3 border-t border-neutral-100 flex flex-col sm:flex-row gap-2">
            <a
              href={waContactUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 py-3 bg-[#075E54] hover:bg-[#064e46] text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-xs"
            >
              <MessageSquare className="w-4 h-4" />
              <span>Falar com o {tenant.name} no WhatsApp</span>
            </a>

            <button
              type="button"
              onClick={() => setShowThermalModal(true)}
              className="px-4 py-3 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors"
            >
              <Printer className="w-4 h-4 text-neutral-600" />
              <span>Imprimir Comanda</span>
            </button>
          </div>
        </div>
      </div>

      {/* Pix Payment Modal */}
      {showPixModal && (
        <PixPaymentModal
          order={order}
          tenant={tenant}
          isOpen={true}
          onPaymentApproved={(updated) => {
            setOrder(updated);
            if (onUpdateOrderStatus) onUpdateOrderStatus(updated.id, 'confirmed');
          }}
          onClose={() => setShowPixModal(false)}
          onViewTracking={() => setShowPixModal(false)}
        />
      )}

      {/* Thermal Ticket Modal */}
      {showThermalModal && (
        <ThermalTicketModal
          order={order}
          tenant={tenant}
          onClose={() => setShowThermalModal(false)}
        />
      )}
    </div>
  );
};
