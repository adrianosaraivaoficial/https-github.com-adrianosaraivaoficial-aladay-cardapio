import React, { useState } from 'react';
import { Clock, CheckCircle2, MapPin, Phone, MessageSquare, X, Copy, Check, ChevronRight, AlertCircle, ShoppingBag } from 'lucide-react';
import { Order, OrderStatus, RestaurantTenant } from '../types';

interface OrderTrackingModalProps {
  order: Order;
  tenant: RestaurantTenant;
  onClose: () => void;
}

export const OrderTrackingModal: React.FC<OrderTrackingModalProps> = ({ order, tenant, onClose }) => {
  const [copiedPix, setCopiedPix] = useState(false);

  const formatBRL = (cents: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
  };

  const steps: { key: OrderStatus; label: string; desc: string }[] = [
    { key: 'received', label: 'Pedido Recebido', desc: 'Gravado com segurança no sistema' },
    { key: 'confirmed', label: 'Confirmado pela Cozinha', desc: 'Atendente aceitou o pedido' },
    { key: 'preparing', label: 'Na Chapa / Forno', desc: 'Em processo de montagem e preparo' },
    { key: 'ready', label: order.type === 'delivery' ? 'Saiu para Entrega 🛵' : 'Pronto para Retirada 🛍️', desc: order.type === 'delivery' ? 'Motoboy a caminho do seu endereço' : 'Pode retirar no balcão' },
    { key: 'delivered', label: 'Entregue com Sucesso', desc: 'Bom apetite!' },
  ];

  const getStepIndex = (status: OrderStatus) => {
    switch (status) {
      case 'received': return 0;
      case 'confirmed': return 1;
      case 'preparing': return 2;
      case 'ready': return 3;
      case 'delivered': return 4;
      default: return 0;
    }
  };

  const currentStepIdx = getStepIndex(order.status);
  const isCancelled = order.status === 'cancelled';

  const mockPixPayload = `00020126580014br.gov.bcb.pix0136${tenant.slug}@saas-cardapios.com520400005303986540${(order.totalCents / 100).toFixed(2)}5802BR5920${tenant.name.slice(0, 20)}6009SAO PAULO62070503***6304E8A9`;

  const handleCopyPix = () => {
    navigator.clipboard.writeText(mockPixPayload);
    setCopiedPix(true);
    setTimeout(() => setCopiedPix(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-fadeIn">
        {/* Header */}
        <div
          className="p-5 text-white flex items-start justify-between relative"
          style={{ backgroundColor: tenant.primaryColor }}
        >
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider opacity-85">
              Acompanhamento ao Vivo &bull; Pedido #{order.orderNumber}
            </span>
            <h2 className="text-lg font-bold mt-0.5 leading-snug">{tenant.name}</h2>
            <p className="text-xs opacity-90 mt-1 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              <span>Previsão: 35 a 50 minutos</span>
            </p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Stepper Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {isCancelled ? (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-center space-y-2">
              <span className="text-xs font-bold text-rose-900 block">Pedido Cancelado pelo Restaurante</span>
              <p className="text-xs text-rose-700">
                O estabelecimento não pôde atender a este pedido no momento. Entre em contato pelo WhatsApp para esclarecimentos.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative pl-6 space-y-6 before:content-[''] before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-neutral-200">
                {steps.map((step, sIdx) => {
                  const isDone = sIdx <= currentStepIdx;
                  const isCurrent = sIdx === currentStepIdx;
                  return (
                    <div key={step.key} className="relative flex items-start gap-3">
                      <div
                        className={`absolute -left-6 mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
                          isDone
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-white border-2 border-neutral-300 text-neutral-400'
                        } ${isCurrent ? 'ring-4 ring-emerald-100' : ''}`}
                      >
                        {isDone ? <Check className="w-3 h-3 stroke-[3]" /> : sIdx + 1}
                      </div>

                      <div className="flex-1">
                        <p
                          className={`text-xs font-bold leading-tight ${
                            isCurrent ? 'text-emerald-800' : isDone ? 'text-neutral-900' : 'text-neutral-400'
                          }`}
                        >
                          {step.label}
                        </p>
                        <p className="text-[11px] text-neutral-500 mt-0.5 leading-snug">{step.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Pix Dynamic Payment Box (If applicable) */}
          {order.paymentMethod.toLowerCase().includes('pix') && (
            <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-neutral-900 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Pagamento via Pix Dinâmico
                </span>
                <span className="text-xs font-mono font-bold text-neutral-900 tabular-nums">
                  {formatBRL(order.totalCents)}
                </span>
              </div>

              <p className="text-[11px] text-neutral-600">
                Pague agora para agilizar o envio ou pague no ato da entrega/retirada.
              </p>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={mockPixPayload}
                  className="flex-1 p-2 bg-white border border-neutral-200 rounded-lg text-[10px] font-mono text-neutral-600 truncate"
                />
                <button
                  onClick={handleCopyPix}
                  className="px-3 py-2 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors flex items-center gap-1.5 shrink-0"
                >
                  {copiedPix ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedPix ? 'Copiado!' : 'Copiar Pix'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Order Summary details */}
          <div className="border-t border-neutral-200 pt-4 space-y-2 text-xs text-neutral-700">
            <div className="flex justify-between items-center text-neutral-900 font-semibold">
              <span className="flex items-center gap-1.5">
                <ShoppingBag className="w-3.5 h-3.5 text-neutral-500" />
                Resumo do Pedido ({order.items.length} itens)
              </span>
              <span className="font-mono tabular-nums">{formatBRL(order.totalCents)}</span>
            </div>

            <div className="bg-neutral-50 p-2.5 rounded-lg space-y-1 text-[11px]">
              {order.items.map((i, idx) => (
                <div key={idx} className="flex justify-between">
                  <span>
                    {i.quantity}x {i.productName}
                  </span>
                  <span className="font-mono tabular-nums">{formatBRL(i.totalCents)}</span>
                </div>
              ))}
            </div>

            {order.deliveryAddress && (
              <p className="text-[11px] text-neutral-600 flex items-start gap-1 pt-1">
                <MapPin className="w-3.5 h-3.5 text-neutral-400 shrink-0 mt-0.5" />
                <span>Entregar em: {order.deliveryAddress}</span>
              </p>
            )}
          </div>
        </div>

        {/* Footer with WhatsApp Store Contact */}
        <div className="p-4 border-t border-neutral-200 bg-neutral-50 flex gap-2">
          <a
            href={`https://wa.me/${tenant.phone}?text=${encodeURIComponent(
              `Olá! Gostaria de informações sobre o meu pedido #${order.orderNumber} em ${tenant.name}.`
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-2.5 px-4 text-xs font-semibold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <MessageSquare className="w-4 h-4 text-emerald-700" />
            <span>Falar com o Restaurante no WhatsApp</span>
          </a>
        </div>
      </div>
    </div>
  );
};
