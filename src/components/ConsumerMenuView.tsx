import React, { useState, useMemo, useEffect } from 'react';
import { ShoppingBag, Clock, MapPin, Plus, Minus, Check, ArrowRight, MessageSquare, AlertCircle, Sparkles, Printer, ExternalLink, Zap, QrCode, Share2, Copy, X } from 'lucide-react';
import { Category, DeliveryZone, OptionGroup, OptionItem, Order, OrderItem, OrderItemOption, Product, RestaurantTenant } from '../types';
import { ThermalTicketModal } from './ThermalTicketModal';
import { PixPaymentModal } from './PixPaymentModal';
import { resolveTenantPixCredentials } from '../utils/pixPayloadGenerator';
import QRCode from 'qrcode';

interface ConsumerMenuViewProps {
  tenant: RestaurantTenant;
  categories: Category[];
  products: Product[];
  onOrderCreated: (newOrder: Order) => void;
  onViewTracking?: (order: Order) => void;
}

export const ConsumerMenuView: React.FC<ConsumerMenuViewProps> = ({
  tenant,
  categories,
  products,
  onOrderCreated,
  onViewTracking,
}) => {
  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.order - b.order),
    [categories]
  );

  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(
    sortedCategories[0]?.id || ''
  );

  useEffect(() => {
    if (
      sortedCategories.length > 0 &&
      !sortedCategories.some((c) => c.id === selectedCategoryId)
    ) {
      setSelectedCategoryId(sortedCategories[0].id);
    }
  }, [sortedCategories, selectedCategoryId]);

  const [activeProductForCustomization, setActiveProductForCustomization] = useState<Product | null>(null);
  
  // Customization modal state
  const [customizationQuantity, setCustomizationQuantity] = useState<number>(1);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string[]>>({});
  const [customizationNotes, setCustomizationNotes] = useState<string>('');

  // Cart state
  const [cartItems, setCartItems] = useState<OrderItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [deliveryType, setDeliveryType] = useState<'delivery' | 'pickup'>('delivery');
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [deliveryAddress, setDeliveryAddress] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('⚡ Pix Instantâneo (Aprovação Automática)');

  // Pix payment modal state
  const [activePixOrder, setActivePixOrder] = useState<Order | null>(null);
  const tenantPix = useMemo(() => resolveTenantPixCredentials(tenant), [tenant]);

  // Confirmation view state
  const [lastPlacedOrder, setLastPlacedOrder] = useState<Order | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showThermalModal, setShowThermalModal] = useState<boolean>(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Share menu state
  const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false);
  const [linkCopied, setLinkCopied] = useState<boolean>(false);
  const [menuShareQrDataUrl, setMenuShareQrDataUrl] = useState<string>('');

  const menuShareUrl = useMemo(() => {
    if (typeof window === 'undefined') return `https://${tenant.slug}.com.br`;
    return `${window.location.origin}${window.location.pathname}?loja=${encodeURIComponent(tenant.slug)}`;
  }, [tenant.slug]);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(menuShareUrl, { width: 160, margin: 1 })
      .then((url) => {
        if (active) setMenuShareQrDataUrl(url);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [menuShareUrl]);

  const handleCopyMenuLink = async () => {
    try {
      await navigator.clipboard.writeText(menuShareUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 3000);
    } catch {
      // Fallback copy method
      const textArea = document.createElement('textarea');
      textArea.value = menuShareUrl;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 3000);
      } catch {
        // ignore
      }
      document.body.removeChild(textArea);
    }
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `Cardápio Digital - ${tenant.name}`,
          text: `Confira o cardápio digital de ${tenant.name} e faça seu pedido online!`,
          url: menuShareUrl,
        });
        return;
      } catch {
        // User cancelled or share failed in iframe, open modal instead
      }
    }
    setIsShareModalOpen(true);
  };

  // Active delivery zones
  const activeDeliveryZones = useMemo(() => {
    return (tenant.deliveryZones || []).filter((z) => z.active);
  }, [tenant.deliveryZones]);

  const [selectedZoneId, setSelectedZoneId] = useState<string>(activeDeliveryZones[0]?.id || '');

  // Filter products by category
  const filteredProducts = useMemo(() => {
    return products.filter((p) => p.categoryId === selectedCategoryId);
  }, [products, selectedCategoryId]);

  // Handle open customization
  const handleOpenProduct = (product: Product) => {
    if (!product.isAvailable) return;
    setActiveProductForCustomization(product);
    setCustomizationQuantity(1);
    setCustomizationNotes('');

    // Pre-populate required single-select options with the first item
    const initialOptions: Record<string, string[]> = {};
    if (product.optionGroups) {
      product.optionGroups.forEach((group) => {
        if (group.required && group.items.length > 0) {
          initialOptions[group.id] = [group.items[0].id];
        } else {
          initialOptions[group.id] = [];
        }
      });
    }
    setSelectedOptions(initialOptions);
  };

  // Toggle option selection
  const handleToggleOption = (group: OptionGroup, item: OptionItem) => {
    const current = selectedOptions[group.id] || [];
    if (group.maxSelections === 1) {
      // Single select (radio behavior)
      setSelectedOptions({
        ...selectedOptions,
        [group.id]: [item.id],
      });
    } else {
      // Multi-select (checkbox behavior)
      if (current.includes(item.id)) {
        setSelectedOptions({
          ...selectedOptions,
          [group.id]: current.filter((id) => id !== item.id),
        });
      } else {
        if (current.length < group.maxSelections) {
          setSelectedOptions({
            ...selectedOptions,
            [group.id]: [...current, item.id],
          });
        }
      }
    }
  };

  // Calculate modal single item price
  const modalItemCalculatedPriceCents = useMemo(() => {
    if (!activeProductForCustomization) return 0;
    let total = activeProductForCustomization.priceCents;
    if (activeProductForCustomization.optionGroups) {
      activeProductForCustomization.optionGroups.forEach((group) => {
        const selectedIds = selectedOptions[group.id] || [];
        group.items.forEach((item) => {
          if (selectedIds.includes(item.id)) {
            total += item.priceCents;
          }
        });
      });
    }
    return total * customizationQuantity;
  }, [activeProductForCustomization, selectedOptions, customizationQuantity]);

  // Add customized item to cart
  const handleAddToCart = () => {
    if (!activeProductForCustomization) return;

    // Collect selected options details
    const optionsSnapshot: OrderItemOption[] = [];
    if (activeProductForCustomization.optionGroups) {
      activeProductForCustomization.optionGroups.forEach((group) => {
        const selectedIds = selectedOptions[group.id] || [];
        group.items.forEach((item) => {
          if (selectedIds.includes(item.id)) {
            optionsSnapshot.push({
              groupId: group.id,
              groupName: group.name,
              itemId: item.id,
              itemName: item.name,
              priceCents: item.priceCents,
            });
          }
        });
      });
    }

    const orderItem: OrderItem = {
      productId: activeProductForCustomization.id,
      productName: activeProductForCustomization.name,
      unitPriceCents: activeProductForCustomization.priceCents,
      quantity: customizationQuantity,
      selectedOptions: optionsSnapshot,
      notes: customizationNotes.trim() || undefined,
      totalCents: modalItemCalculatedPriceCents,
    };

    setCartItems([...cartItems, orderItem]);
    setActiveProductForCustomization(null);
    setIsCartOpen(true);
  };

  // Cart totals with server recalculation simulation
  const cartSubtotalCents = useMemo(() => {
    return cartItems.reduce((acc, item) => acc + item.totalCents, 0);
  }, [cartItems]);

  const selectedZone = activeDeliveryZones.find((z) => z.id === selectedZoneId);
  const deliveryFee = deliveryType === 'delivery'
    ? (selectedZone ? selectedZone.feeCents : tenant.deliveryFeeCents)
    : 0;
  const cartGrandTotalCents = cartSubtotalCents + deliveryFee;

  // Checkout submission (Idempotency + Outbox pattern simulation)
  const handleCheckoutSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCheckoutError(null);
    if (cartItems.length === 0) return;
    if (cartSubtotalCents < tenant.minOrderCents) {
      setCheckoutError(`O pedido mínimo para entrega é R$ ${(tenant.minOrderCents / 100).toFixed(2)}`);
      return;
    }

    setIsSubmitting(true);

    setTimeout(() => {
      const orderNumber = Math.floor(1043 + Math.random() * 50);
      const isPixDynamic = paymentMethod.includes('Pix Instantâneo');
      const newOrder: Order = {
        id: `ord_${orderNumber}`,
        orderNumber,
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        type: deliveryType,
        deliveryAddress: deliveryType === 'delivery' ? deliveryAddress.trim() : undefined,
        deliveryZoneName: selectedZone?.name,
        estimatedMinutes: selectedZone?.estimatedMinutes || 35,
        items: [...cartItems],
        subtotalCents: cartSubtotalCents,
        deliveryFeeCents: deliveryFee,
        totalCents: cartGrandTotalCents,
        status: isPixDynamic ? 'received' : 'confirmed',
        paymentStatus: 'pending',
        paymentMethod: isPixDynamic ? 'Pix Dinâmico Instantâneo' : paymentMethod,
        whatsAppStatus: 'delivered',
        whatsAppLogs: [
          {
            timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            event: 'order.created',
            detail: `Pedido #${orderNumber} registrado no sistema via Cardápio Digital (${isPixDynamic ? 'Aguardando Pagamento Pix' : paymentMethod}).`,
          },
        ],
        createdAt: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        updatedAt: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      };

      onOrderCreated(newOrder);
      setLastPlacedOrder(newOrder);
      setCartItems([]);
      setIsSubmitting(false);
      setIsCartOpen(false);

      if (isPixDynamic) {
        setActivePixOrder(newOrder);
      }
    }, 600);
  };

  const formatBRL = (cents: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
  };

  return (
    <div className="max-w-md mx-auto bg-white border border-neutral-300 rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-[720px] relative">
      {/* Phone status bar simulation */}
      <div className="bg-neutral-900 text-white text-[10px] px-4 py-1.5 flex justify-between items-center font-mono select-none">
        <span>19:42 · 4G LTE</span>
        <span className="text-neutral-400">{tenant.slug}.com.br</span>
        <span>100% 🔋</span>
      </div>

      {/* Restaurant Header */}
      <div
        className="p-5 text-white relative"
        style={{ backgroundColor: tenant.primaryColor }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <span className="text-[10px] uppercase font-bold tracking-wider opacity-90">
              Cardápio Digital Oficial
            </span>
            <h1 className="text-lg font-bold mt-0.5 leading-tight truncate">{tenant.name}</h1>
            <p className="text-xs opacity-90 mt-1 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span>{tenant.openingHoursText}</span>
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setIsShareModalOpen(true)}
              title="Compartilhar link do cardápio"
              className="bg-white text-neutral-900 hover:bg-neutral-100 px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer active:scale-95"
            >
              <Share2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Compartilhar</span>
            </button>
            <div className="bg-white/20 backdrop-blur-xs px-2.5 py-1 rounded-lg text-[11px] font-medium">
              Aberto
            </div>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-white/20 flex items-center justify-between text-xs opacity-90">
          <span className="flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            <span>Entrega: {formatBRL(tenant.deliveryFeeCents)}</span>
          </span>
          <span>Mínimo: {formatBRL(tenant.minOrderCents)}</span>
        </div>

        {/* Share Link Quick Bar inside Menu Header */}
        <div className="mt-3 pt-2.5 border-t border-white/20 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0 flex-1 bg-black/20 rounded-lg px-2.5 py-1.5">
            <Share2 className="w-3.5 h-3.5 text-white/80 shrink-0" />
            <span className="text-[11px] font-mono text-white/95 truncate" title={menuShareUrl}>
              {menuShareUrl}
            </span>
          </div>
          <button
            type="button"
            onClick={handleCopyMenuLink}
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 shrink-0 transition-all cursor-pointer shadow-2xs ${
              linkCopied
                ? 'bg-emerald-500 text-white'
                : 'bg-white text-neutral-900 hover:bg-neutral-100'
            }`}
          >
            {linkCopied ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Link Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copiar Link</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* If Order Placed: Confirmation Screen */}
      {lastPlacedOrder ? (
        <div className="p-6 flex-1 flex flex-col items-center justify-center text-center space-y-4">
          <div className="w-12 h-12 bg-emerald-100 text-emerald-800 rounded-full flex items-center justify-center">
            <Check className="w-6 h-6 stroke-[3]" />
          </div>

          <div>
            <span className="text-xs text-neutral-500 font-mono">
              Pedido #{lastPlacedOrder.orderNumber}
            </span>
            <h2 className="text-xl font-bold text-neutral-900 mt-0.5">Pedido Enviado com Sucesso!</h2>
            <p className="text-xs text-neutral-600 mt-1">
              O pedido foi validado e gravado no banco de dados. Uma notificação foi enviada ao seu WhatsApp pelo restaurante.
            </p>
          </div>

          {/* WhatsApp Evolution Simulation Box */}
          <div className="w-full bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-left space-y-2">
            <div className="flex items-center gap-2 text-emerald-900 text-xs font-semibold">
              <MessageSquare className="w-3.5 h-3.5 text-emerald-700" />
              <span>WhatsApp Evolution API Dispatched</span>
            </div>
            <p className="text-[11px] text-emerald-800 font-mono whitespace-pre-wrap leading-relaxed">
              {`🍔 *${tenant.name}*\nOlá, ${lastPlacedOrder.customerName}! Recebemos seu pedido #${lastPlacedOrder.orderNumber}.\nTotal: ${formatBRL(lastPlacedOrder.totalCents)}\nAguarde a confirmação da cozinha!`}
            </p>
          </div>

          <div className="w-full border-t border-neutral-200 pt-3 flex flex-col gap-2">
            {lastPlacedOrder.paymentMethod.includes('Pix') && (
              <button
                type="button"
                onClick={() => setActivePixOrder(lastPlacedOrder)}
                className={`w-full py-2.5 px-4 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-xs ${
                  lastPlacedOrder.paymentStatus === 'paid_online'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white animate-pulse'
                }`}
              >
                <Zap className="w-3.5 h-3.5 text-amber-300" />
                <span>
                  {lastPlacedOrder.paymentStatus === 'paid_online'
                    ? '✓ Pix Pago com Sucesso (Ver Comprovante)'
                    : '⚡ Pagar Agora com Pix Dinâmico (QR Code)'}
                </span>
              </button>
            )}

            {onViewTracking && (
              <button
                type="button"
                onClick={() => onViewTracking(lastPlacedOrder)}
                className="w-full py-2.5 px-4 text-xs font-bold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-xs"
              >
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>Rastrear Pedido em Tempo Real (Visão Cliente)</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            <a
              href={`https://wa.me/${tenant.phone}?text=${encodeURIComponent(`Olá! Acabei de fazer o pedido #${lastPlacedOrder.orderNumber} pelo cardápio digital do ${tenant.name}. Total: ${formatBRL(lastPlacedOrder.totalCents)}. Poderiam confirmar o recebimento?`)}`}
              target="_blank"
              rel="noreferrer"
              className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-xs"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Acompanhar Pedido no WhatsApp</span>
              <ExternalLink className="w-3 h-3 opacity-80" />
            </a>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowThermalModal(true)}
                className="flex-1 py-2 px-3 text-xs font-semibold text-neutral-700 bg-white border border-neutral-300 hover:bg-neutral-50 rounded-lg transition-colors flex items-center justify-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5 text-neutral-500" />
                <span>Comanda Térmica</span>
              </button>

              <button
                onClick={() => setLastPlacedOrder(null)}
                className="flex-1 py-2 px-3 text-xs font-semibold text-neutral-800 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors"
              >
                Novo Pedido
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Category Tabs */}
          <div className="bg-neutral-50 border-b border-neutral-200 px-3 py-2 flex gap-2 overflow-x-auto no-scrollbar shrink-0">
            {sortedCategories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategoryId(cat.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                  selectedCategoryId === cat.id
                    ? 'bg-neutral-900 text-white'
                    : 'text-neutral-600 hover:text-neutral-900 bg-white border border-neutral-200'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Product List */}
          <div className="p-4 space-y-3 flex-1 overflow-y-auto">
            {filteredProducts.map((product) => (
              <div
                key={product.id}
                onClick={() => handleOpenProduct(product)}
                className="p-3 border border-neutral-200 rounded-xl hover:border-neutral-300 transition-colors flex gap-3 cursor-pointer bg-white group"
              >
                {/* Image */}
                {product.imageUrl ? (
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    className="w-20 h-20 rounded-lg object-cover shrink-0 bg-neutral-100"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-lg bg-neutral-100 flex items-center justify-center shrink-0 text-neutral-400 text-xs">
                    Sem foto
                  </div>
                )}

                <div className="flex-1 flex flex-col justify-between min-w-0">
                  <div>
                    <h3 className="text-xs font-bold text-neutral-900 leading-snug group-hover:text-amber-700 transition-colors">
                      {product.name}
                    </h3>
                    <p className="text-[11px] text-neutral-500 line-clamp-2 mt-1 leading-normal">
                      {product.description}
                    </p>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs font-mono font-bold text-neutral-900 tabular-nums">
                      {formatBRL(product.priceCents)}
                    </span>
                    <button className="text-[11px] font-semibold text-neutral-800 bg-neutral-100 hover:bg-neutral-200 px-2 py-1 rounded">
                      Adicionar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Floating Cart Button Bar */}
          {cartItems.length > 0 && (
            <div className="p-3 bg-white border-t border-neutral-200 shrink-0">
              <button
                onClick={() => setIsCartOpen(true)}
                className="w-full flex items-center justify-between p-3 rounded-xl text-white font-medium text-xs shadow-sm transition-transform active:scale-[0.99]"
                style={{ backgroundColor: tenant.primaryColor }}
              >
                <div className="flex items-center gap-2">
                  <div className="bg-black/20 px-2 py-0.5 rounded font-mono font-bold text-white">
                    {cartItems.reduce((acc, i) => acc + i.quantity, 0)}
                  </div>
                  <span>Ver Sacola</span>
                </div>
                <span className="font-mono font-bold tabular-nums">
                  {formatBRL(cartGrandTotalCents)}
                </span>
              </button>
            </div>
          )}
        </>
      )}

      {/* Customization Bottom Sheet / Modal */}
      {activeProductForCustomization && (
        <div className="absolute inset-0 bg-black/60 z-30 flex flex-col justify-end animate-fadeIn">
          <div className="bg-white rounded-t-2xl max-h-[85%] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-neutral-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-neutral-900">
                  {activeProductForCustomization.name}
                </h3>
                <p className="text-xs font-mono text-neutral-600 tabular-nums">
                  A partir de {formatBRL(activeProductForCustomization.priceCents)}
                </p>
              </div>
              <button
                onClick={() => setActiveProductForCustomization(null)}
                className="text-xs font-medium text-neutral-500 hover:text-neutral-900 p-1"
              >
                Fechar
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4 flex-1">
              {/* Option Groups */}
              {activeProductForCustomization.optionGroups?.map((group) => (
                <div key={group.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-neutral-900">{group.name}</span>
                    <span className="text-[11px] text-neutral-500">
                      {group.required ? 'Obrigatório' : 'Opcional'} · Escolha até {group.maxSelections}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {group.items.map((item) => {
                      const isSelected = (selectedOptions[group.id] || []).includes(item.id);
                      return (
                        <div
                          key={item.id}
                          onClick={() => handleToggleOption(group, item)}
                          className={`p-2.5 rounded-lg border text-xs flex items-center justify-between cursor-pointer transition-colors ${
                            isSelected
                              ? 'border-neutral-900 bg-neutral-50 font-medium text-neutral-900'
                              : 'border-neutral-200 text-neutral-700 hover:bg-neutral-50'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-4 h-4 rounded flex items-center justify-center text-[10px] ${
                                group.maxSelections === 1 ? 'rounded-full' : 'rounded'
                              } ${
                                isSelected
                                  ? 'bg-neutral-900 text-white'
                                  : 'border border-neutral-300'
                              }`}
                            >
                              {isSelected && <Check className="w-2.5 h-2.5" />}
                            </div>
                            <span>{item.name}</span>
                          </div>
                          {item.priceCents > 0 && (
                            <span className="font-mono text-neutral-600 tabular-nums">
                              +{formatBRL(item.priceCents)}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-neutral-900 mb-1">
                  Observações para a cozinha
                </label>
                <textarea
                  value={customizationNotes}
                  onChange={(e) => setCustomizationNotes(e.target.value)}
                  placeholder="Ex: sem cebola, ponto bem passado, etc."
                  rows={2}
                  className="w-full p-2 text-xs border border-neutral-200 rounded-lg text-neutral-800 focus:outline-none focus:ring-1 focus:ring-neutral-400"
                />
              </div>
            </div>

            {/* Modal Bottom Actions */}
            <div className="p-4 border-t border-neutral-200 flex items-center gap-3">
              <div className="flex items-center border border-neutral-200 rounded-lg overflow-hidden shrink-0">
                <button
                  onClick={() => setCustomizationQuantity(Math.max(1, customizationQuantity - 1))}
                  className="p-2 text-neutral-600 hover:bg-neutral-100"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="px-3 text-xs font-mono font-bold text-neutral-900 tabular-nums">
                  {customizationQuantity}
                </span>
                <button
                  onClick={() => setCustomizationQuantity(customizationQuantity + 1)}
                  className="p-2 text-neutral-600 hover:bg-neutral-100"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                onClick={handleAddToCart}
                className="flex-1 py-2.5 px-4 rounded-lg text-white font-medium text-xs flex items-center justify-between transition-opacity hover:opacity-90"
                style={{ backgroundColor: tenant.primaryColor }}
              >
                <span>Adicionar ao Pedido</span>
                <span className="font-mono font-bold tabular-nums">
                  {formatBRL(modalItemCalculatedPriceCents)}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cart Drawer & Checkout */}
      {isCartOpen && (
        <div className="absolute inset-0 bg-black/60 z-40 flex flex-col justify-end animate-fadeIn">
          <div className="bg-white rounded-t-2xl max-h-[92%] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-neutral-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-neutral-700" />
                <h3 className="text-sm font-bold text-neutral-900">Sua Sacola</h3>
              </div>
              <button
                onClick={() => setIsCartOpen(false)}
                className="text-xs font-medium text-neutral-500 hover:text-neutral-900"
              >
                Voltar
              </button>
            </div>

            <form onSubmit={handleCheckoutSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Delivery vs Pickup Selector */}
              <div className="grid grid-cols-2 p-1 bg-neutral-100 rounded-lg text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setDeliveryType('delivery')}
                  className={`py-2 rounded-md transition-colors ${
                    deliveryType === 'delivery'
                      ? 'bg-white text-neutral-900 shadow-xs'
                      : 'text-neutral-600'
                  }`}
                >
                  Entrega (Delivery)
                </button>
                <button
                  type="button"
                  onClick={() => setDeliveryType('pickup')}
                  className={`py-2 rounded-md transition-colors ${
                    deliveryType === 'pickup'
                      ? 'bg-white text-neutral-900 shadow-xs'
                      : 'text-neutral-600'
                  }`}
                >
                  Retirada no Balcão
                </button>
              </div>

              {/* Items List */}
              <div className="space-y-2 border-b border-neutral-200 pb-3">
                {cartItems.map((item, idx) => (
                  <div key={idx} className="flex items-start justify-between text-xs">
                    <div>
                      <p className="font-semibold text-neutral-900">
                        {item.quantity}x {item.productName}
                      </p>
                      {item.selectedOptions.map((opt, oIdx) => (
                        <p key={oIdx} className="text-[11px] text-neutral-500 pl-2">
                          + {opt.itemName} {opt.priceCents > 0 && `(${formatBRL(opt.priceCents)})`}
                        </p>
                      ))}
                      {item.notes && (
                        <p className="text-[10px] text-amber-700 italic pl-2">Obs: {item.notes}</p>
                      )}
                    </div>
                    <span className="font-mono font-bold text-neutral-900 tabular-nums">
                      {formatBRL(item.totalCents)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Zero-Trust Notice */}
              <div className="bg-neutral-50 border border-neutral-200 rounded p-2.5 text-[11px] text-neutral-600 flex items-start gap-2">
                <Sparkles className="w-3.5 h-3.5 text-neutral-600 mt-0.5 shrink-0" />
                <span>
                  <strong>Validação Zero-Trust:</strong> Todos os preços e a taxa de entrega são recalculados diretamente no servidor antes da gravação final.
                </span>
              </div>

              {/* Customer Inputs */}
              <div className="space-y-3 pt-1">
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">Seu Nome Completo</label>
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full p-2 text-xs border border-neutral-200 rounded-md text-neutral-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">WhatsApp (DDD + Número)</label>
                  <input
                    type="tel"
                    required
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="11987654321"
                    className="w-full p-2 text-xs border border-neutral-200 rounded-md text-neutral-800 font-mono"
                  />
                </div>

                {deliveryType === 'delivery' && (
                  <>
                    {activeDeliveryZones.length > 0 && (
                      <div>
                        <label className="block text-xs font-medium text-neutral-700 mb-1 flex items-center justify-between">
                          <span>Bairro / Região de Entrega</span>
                          <span className="text-[10px] text-emerald-700 font-semibold font-mono">
                            {selectedZone ? `Taxa: ${formatBRL(selectedZone.feeCents)} (~${selectedZone.estimatedMinutes} min)` : ''}
                          </span>
                        </label>
                        <select
                          value={selectedZoneId}
                          onChange={(e) => setSelectedZoneId(e.target.value)}
                          className="w-full p-2 text-xs border border-neutral-200 rounded-md text-neutral-800 bg-white"
                        >
                          {activeDeliveryZones.map((zone) => (
                            <option key={zone.id} value={zone.id}>
                              {zone.name} &bull; {formatBRL(zone.feeCents)} (~{zone.estimatedMinutes} min)
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-medium text-neutral-700 mb-1">Endereço de Entrega Completo</label>
                      <input
                        type="text"
                        required
                        value={deliveryAddress}
                        onChange={(e) => setDeliveryAddress(e.target.value)}
                        placeholder="Rua, Número, Apto / Bloco"
                        className="w-full p-2 text-xs border border-neutral-200 rounded-md text-neutral-800"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">Forma de Pagamento</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full p-2 text-xs border border-emerald-300 rounded-md text-neutral-800 bg-white font-medium focus:outline-emerald-600"
                  >
                    <option value="⚡ Pix Instantâneo (Aprovação Automática)">⚡ Pix Instantâneo (Aprovação Automática em 10s)</option>
                    <option value="Pix no Recebimento">Pix na Entrega / Retirada</option>
                    <option value="Cartão de Crédito na Entrega">Cartão de Crédito na Maquininha</option>
                    <option value="Cartão de Débito">Cartão de Débito</option>
                    <option value="Dinheiro">Dinheiro (especificar troco nas observações)</option>
                  </select>

                  {paymentMethod.includes('Pix') && (
                    <div className="mt-2 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-900 space-y-1">
                      <div className="flex items-center justify-between font-bold">
                        <span className="flex items-center gap-1">
                          <QrCode className="w-3.5 h-3.5 text-emerald-600" />
                          <span>QR Code Pix Direto do Restaurante</span>
                        </span>
                        <span className="text-[10px] font-mono bg-white px-1.5 py-0.5 rounded border border-emerald-200 text-emerald-700">
                          Conta do Proprietário
                        </span>
                      </div>
                      <div className="text-[11px] text-emerald-800 flex flex-wrap items-center justify-between gap-1 pt-1 border-t border-emerald-200/60">
                        <span>
                          Beneficiário: <strong>{tenantPix.beneficiaryName}</strong>
                        </span>
                        <span className="font-mono">
                          Chave: <strong>{tenantPix.pixKey}</strong>
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Totals Breakdown */}
              <div className="border-t border-neutral-200 pt-3 space-y-1 text-xs">
                <div className="flex justify-between text-neutral-600">
                  <span>Subtotal</span>
                  <span className="font-mono tabular-nums">{formatBRL(cartSubtotalCents)}</span>
                </div>
                <div className="flex justify-between text-neutral-600">
                  <span>Taxa de Entrega</span>
                  <span className="font-mono tabular-nums">{formatBRL(deliveryFee)}</span>
                </div>
                <div className="flex justify-between text-neutral-900 font-bold text-sm pt-1 border-t border-neutral-100">
                  <span>Total do Pedido</span>
                  <span className="font-mono tabular-nums">{formatBRL(cartGrandTotalCents)}</span>
                </div>
              </div>

              {checkoutError && (
                <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{checkoutError}</span>
                </div>
              )}

              {/* Submit CTA */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 px-4 rounded-xl text-white font-semibold text-xs flex items-center justify-center gap-2 transition-opacity hover:opacity-95 disabled:opacity-50"
                style={{ backgroundColor: tenant.primaryColor }}
              >
                {isSubmitting ? (
                  <span>Recalculando no servidor...</span>
                ) : (
                  <>
                    <span>Concluir Pedido no WhatsApp</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Share Menu Modal */}
      {isShareModalOpen && (
        <div className="absolute inset-0 bg-black/60 z-50 flex flex-col justify-end animate-fadeIn">
          <div className="bg-white rounded-t-2xl p-5 space-y-4 max-h-[90%] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Share2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-neutral-900">Compartilhar Cardápio Digital</h3>
                  <p className="text-[11px] text-neutral-500">{tenant.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsShareModalOpen(false)}
                className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-neutral-700">
                Link Direto do Cardápio
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={menuShareUrl}
                  onFocus={(e) => e.target.select()}
                  className="flex-1 p-2.5 text-xs font-mono bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-800 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopyMenuLink}
                  className={`px-3.5 py-2.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer ${
                    linkCopied
                      ? 'bg-emerald-600 text-white'
                      : 'bg-neutral-900 hover:bg-neutral-800 text-white'
                  }`}
                >
                  {linkCopied ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar</span>
                    </>
                  )}
                </button>
              </div>
              {linkCopied && (
                <p className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  <span>Link copiado para a área de transferência!</span>
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2 pt-1">
              <a
                href={`https://wa.me/?text=${encodeURIComponent(
                  `🍔 Confira o cardápio digital de *${tenant.name}* e faça seu pedido online:\n${menuShareUrl}`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors shadow-xs"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Enviar Link pelo WhatsApp</span>
                <ExternalLink className="w-3.5 h-3.5 opacity-80" />
              </a>

              {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
                <button
                  type="button"
                  onClick={handleNativeShare}
                  className="w-full py-2.5 px-4 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Mais Opções de Compartilhamento</span>
                </button>
              )}
            </div>

            {/* QR Code for quick physical/table sharing (generated locally for privacy) */}
            <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3 flex items-center gap-3">
              {menuShareQrDataUrl && (
                <img
                  src={menuShareQrDataUrl}
                  alt={`QR Code ${tenant.name}`}
                  className="w-16 h-16 rounded-lg border border-neutral-200 bg-white p-1 shrink-0"
                />
              )}
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-xs font-bold text-neutral-900">
                  <QrCode className="w-3.5 h-3.5 text-emerald-700" />
                  <span>QR Code do Cardápio</span>
                </div>
                <p className="text-[11px] text-neutral-600 leading-relaxed">
                  Aponte a câmera do celular para abrir o cardápio digital ou envie o link direto para seus clientes no WhatsApp e Instagram.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pix Payment Modal */}
      {activePixOrder && (
        <PixPaymentModal
          order={activePixOrder}
          tenant={tenant}
          isOpen={true}
          onPaymentApproved={(updated) => {
            setLastPlacedOrder(updated);
            onOrderCreated(updated);
          }}
          onClose={() => setActivePixOrder(null)}
          onViewTracking={(order) => {
            setActivePixOrder(null);
            if (onViewTracking) onViewTracking(order);
          }}
        />
      )}

      {/* Thermal Ticket Modal */}
      {showThermalModal && lastPlacedOrder && (
        <ThermalTicketModal
          order={lastPlacedOrder}
          tenant={tenant}
          onClose={() => setShowThermalModal(false)}
        />
      )}
    </div>
  );
};

