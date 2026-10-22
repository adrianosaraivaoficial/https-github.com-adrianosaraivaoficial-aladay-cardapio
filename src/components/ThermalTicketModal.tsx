import React from 'react';
import { Printer, X, Check, Copy } from 'lucide-react';
import { Order, RestaurantTenant } from '../types';

interface ThermalTicketModalProps {
  order: Order | null;
  tenant: RestaurantTenant;
  onClose: () => void;
}

export const ThermalTicketModal: React.FC<ThermalTicketModalProps> = ({ order, tenant, onClose }) => {
  const [copied, setCopied] = React.useState(false);

  if (!order) return null;

  const formatBRL = (cents: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
  };

  const handlePrint = () => {
    window.print();
  };

  const ticketText = `
========================================
       ${tenant.name.toUpperCase()}
   ${tenant.address}
   WhatsApp: +${tenant.phone}
========================================
PEDIDO #${order.orderNumber}
DATA: ${order.createdAt}
TIPO: ${order.type === 'delivery' ? 'ENTREGA (DELIVERY) 🛵' : 'RETIRADA NO BALCÃO 🛍️'}
CLIENTE: ${order.customerName}
CONTATO: ${order.customerPhone}
${order.deliveryAddress ? `ENDEREÇO:\n${order.deliveryAddress}` : ''}
----------------------------------------
ITENS DO PEDIDO:
${order.items
  .map(
    (item, idx) => `
[${idx + 1}] ${item.quantity}x ${item.productName} - ${formatBRL(item.totalCents)}
${item.selectedOptions.map((opt) => `    + ${opt.itemName} ${opt.priceCents > 0 ? `(${formatBRL(opt.priceCents)})` : ''}`).join('\n')}
${item.notes ? `    OBS: ${item.notes}` : ''}`
  )
  .join('\n')}
----------------------------------------
Subtotal:              ${formatBRL(order.subtotalCents)}
Taxa de Entrega:       ${formatBRL(order.deliveryFeeCents)}
TOTAL DO PEDIDO:       ${formatBRL(order.totalCents)}
----------------------------------------
FORMA DE PAGAMENTO:
${order.paymentMethod}
========================================
   Desenvolvido por [NOME_DO_SAAS]
========================================
`.trim();

  const handleCopyText = () => {
    navigator.clipboard.writeText(ticketText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-sm w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-fadeIn">
        {/* Header */}
        <div className="p-4 border-b border-neutral-200 flex items-center justify-between bg-neutral-50">
          <div className="flex items-center gap-2">
            <Printer className="w-4 h-4 text-neutral-700" />
            <h3 className="text-xs font-bold text-neutral-900">Comanda Térmica (ESC/POS 80mm)</h3>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-800 p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Authentic Thermal Paper styling */}
        <div className="p-4 overflow-y-auto flex-1 bg-amber-50/20 font-mono text-[11px] leading-tight text-neutral-900 select-all border-y border-dashed border-neutral-300">
          <div className="text-center font-bold pb-2 border-b border-dashed border-neutral-400 space-y-0.5">
            <p className="text-xs tracking-wider">{tenant.name.toUpperCase()}</p>
            <p className="text-[10px] text-neutral-600 font-normal">{tenant.address}</p>
            <p className="text-[10px] text-neutral-600 font-normal">WhatsApp: +{tenant.phone}</p>
          </div>

          <div className="py-2 border-b border-dashed border-neutral-400 space-y-1">
            <div className="flex justify-between font-bold text-xs">
              <span>PEDIDO #{order.orderNumber}</span>
              <span>{order.createdAt}</span>
            </div>
            <p>CLIENTE: {order.customerName}</p>
            <p>FONE: {order.customerPhone}</p>
            <p className="font-bold">
              MODALIDADE: {order.type === 'delivery' ? 'ENTREGA (DELIVERY) 🛵' : 'RETIRADA NO BALCÃO 🛍️'}
            </p>
            {order.deliveryAddress && (
              <p className="text-[10px] bg-neutral-100 p-1 rounded font-sans mt-0.5">
                <strong>Endereço:</strong> {order.deliveryAddress}
              </p>
            )}
          </div>

          <div className="py-2 border-b border-dashed border-neutral-400 space-y-2">
            <p className="font-bold text-[10px] uppercase text-neutral-500">Itens para a Cozinha:</p>
            {order.items.map((item, idx) => (
              <div key={idx} className="space-y-0.5">
                <div className="flex justify-between font-bold">
                  <span>
                    {item.quantity}x {item.productName}
                  </span>
                  <span>{formatBRL(item.totalCents)}</span>
                </div>
                {item.selectedOptions.map((opt, oIdx) => (
                  <p key={oIdx} className="text-[10px] text-neutral-600 pl-2">
                    &bull; {opt.groupName}: {opt.itemName} {opt.priceCents > 0 && `(+${formatBRL(opt.priceCents)})`}
                  </p>
                ))}
                {item.notes && (
                  <p className="text-[10px] font-bold text-neutral-900 bg-amber-100/60 p-1 rounded font-sans">
                    OBS: {item.notes}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="py-2 border-b border-dashed border-neutral-400 space-y-1">
            <div className="flex justify-between text-[10px]">
              <span>Subtotal:</span>
              <span>{formatBRL(order.subtotalCents)}</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span>Taxa de Entrega:</span>
              <span>{formatBRL(order.deliveryFeeCents)}</span>
            </div>
            <div className="flex justify-between font-bold text-xs pt-1 border-t border-dotted border-neutral-300">
              <span>TOTAL DO PEDIDO:</span>
              <span>{formatBRL(order.totalCents)}</span>
            </div>
            <p className="text-[10px] text-neutral-600 pt-1">
              Pagamento: <strong>{order.paymentMethod}</strong>
            </p>
          </div>

          <div className="pt-2 text-center text-[9px] text-neutral-400">
            [NOME_DO_SAAS] &bull; Sistema de Cardápios &amp; WhatsApp
          </div>
        </div>

        {/* Footer actions */}
        <div className="p-3 border-t border-neutral-200 bg-neutral-50 flex gap-2">
          <button
            onClick={handleCopyText}
            className="w-1/2 py-2 px-3 text-xs font-semibold text-neutral-700 bg-white border border-neutral-300 hover:bg-neutral-100 rounded-lg transition-colors flex items-center justify-center gap-1.5"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copiado!' : 'Copiar Texto'}</span>
          </button>

          <button
            onClick={handlePrint}
            className="w-1/2 py-2 px-3 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-xs"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Imprimir</span>
          </button>
        </div>
      </div>
    </div>
  );
};
