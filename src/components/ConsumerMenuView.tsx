import React, { useState, useMemo, useEffect } from 'react';
import { ShoppingBag, Clock, MapPin, Plus, Minus, Check, ArrowRight, ArrowLeft, MessageSquare, AlertCircle, Sparkles, Printer, ExternalLink, Zap, QrCode, Share2, Copy, X, Settings, Trash2, Search, UserCheck } from 'lucide-react';
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
  onUpdateTenant?: (updatedTenant: RestaurantTenant) => void;
  canConfigureSchedule?: boolean;
}

export const ConsumerMenuView: React.FC<ConsumerMenuViewProps> = ({
  tenant,
  categories,
  products,
  onOrderCreated,
  onViewTracking,
  onUpdateTenant,
  canConfigureSchedule = false,
}) => {
  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.order - b.order),
    [categories]
  );

  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    if (
      selectedCategoryId !== 'ALL' &&
      sortedCategories.length > 0 &&
      !sortedCategories.some((c) => c.id === selectedCategoryId)
    ) {
      setSelectedCategoryId('ALL');
    }
  }, [sortedCategories, selectedCategoryId]);

  const [activeProductForCustomization, setActiveProductForCustomization] = useState<Product | null>(null);
  
  // Customization modal state
  const [customizationQuantity, setCustomizationQuantity] = useState<number>(1);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string[]>>({});
  const [customizationNotes, setCustomizationNotes] = useState<string>('');

  // Cart & 2-step checkout state ('bag' = revisar produtos, 'checkout' = preencher dados e finalizar)
  const [cartItems, setCartItems] = useState<OrderItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [cartStep, setCartStep] = useState<'bag' | 'checkout'>('bag');
  const [addedToastMessage, setAddedToastMessage] = useState<string | null>(null);
  const [cashChangeFor, setCashChangeFor] = useState<string>('');
  const [deliveryType, setDeliveryType] = useState<'delivery' | 'pickup' | 'dine_in'>('delivery');
  const [tableNumber, setTableNumber] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    try {
      const saved = JSON.parse(localStorage.getItem('aladay_customer_profile') || '{}');
      return saved.name || '';
    } catch {
      return '';
    }
  });
  const [customerPhone, setCustomerPhone] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    try {
      const saved = JSON.parse(localStorage.getItem('aladay_customer_profile') || '{}');
      return saved.phone || '';
    } catch {
      return '';
    }
  });
  const [deliveryAddress, setDeliveryAddress] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    try {
      const saved = JSON.parse(localStorage.getItem('aladay_customer_profile') || '{}');
      return saved.address || '';
    } catch {
      return '';
    }
  });
  const [paymentMethod, setPaymentMethod] = useState<string>('⚡ Pix Instantâneo (Aprovação Automática)');

  // Detect ?mesa=XX from QR Code on Table
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const mesaParam = params.get('mesa');
    if (mesaParam) {
      setTableNumber(mesaParam.replace(/\D/g, '').padStart(2, '0'));
      setDeliveryType('dine_in');
    }
  }, []);

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

  // Real-time clock & top bar schedule configurator state
  const [currentTimeStr, setCurrentTimeStr] = useState<string>(() =>
    new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  );
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState<boolean>(false);
  const [scheduleDaysPreset, setScheduleDaysPreset] = useState<string>('Segunda a Domingo');
  const [scheduleStartTime, setScheduleStartTime] = useState<string>('18:00');
  const [scheduleEndTime, setScheduleEndTime] = useState<string>('23:45');
  const [scheduleCustomText, setScheduleCustomText] = useState<string>(
    tenant.openingHoursText || 'Segunda a Domingo: 18:00 às 23:45'
  );
  const [scheduleIsOpen, setScheduleIsOpen] = useState<boolean>(tenant.isOpen ?? true);
  const [scheduleSavedToast, setScheduleSavedToast] = useState<boolean>(false);

  useEffect(() => {
    const updateClock = () => {
      setCurrentTimeStr(
        new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      );
    };
    updateClock();
    const intervalId = setInterval(updateClock, 30000);
    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const raw = tenant.openingHoursText || 'Segunda a Domingo: 18:00 às 23:45';
    setScheduleCustomText(raw);
    setScheduleIsOpen(tenant.isOpen ?? true);
    const match = raw.match(/^(.*?):\s*(\d{2}:\d{2})\s*(?:às|as|-|até)\s*(\d{2}:\d{2})$/i);
    if (match) {
      setScheduleDaysPreset(match[1].trim());
      setScheduleStartTime(match[2]);
      setScheduleEndTime(match[3]);
    }
  }, [tenant.openingHoursText, tenant.isOpen]);

  const handleSaveTopBarSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalHoursText = scheduleCustomText.trim() || `${scheduleDaysPreset}: ${scheduleStartTime} às ${scheduleEndTime}`;
    const updatedTenant: RestaurantTenant = {
      ...tenant,
      openingHoursText: finalHoursText,
      isOpen: scheduleIsOpen,
    };
    if (onUpdateTenant) {
      onUpdateTenant(updatedTenant);
    }
    try {
      await fetch(`/api/v1/tenants/${encodeURIComponent(tenant.slug)}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
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
      // state already updated locally
    }
    setScheduleSavedToast(true);
    setTimeout(() => {
      setScheduleSavedToast(false);
      setIsScheduleModalOpen(false);
    }, 900);
  };

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

  // Filter products by category & search query
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesCategory = selectedCategoryId === 'ALL' || p.categoryId === selectedCategoryId;
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [products, selectedCategoryId, searchQuery]);

  const triggerAddedToast = (productName: string) => {
    setAddedToastMessage(`${productName} adicionado à sacola!`);
    setTimeout(() => {
      setAddedToastMessage((prev) =>
        prev === `${productName} adicionado à sacola!` ? null : prev
      );
    }, 2200);
  };

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

  // Quick add directly from card when product has no required option groups
  const handleQuickAddProduct = (product: Product, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!product.isAvailable) return;
    const hasRequiredOptions = product.optionGroups?.some((g) => g.required);
    if (hasRequiredOptions) {
      handleOpenProduct(product);
      return;
    }

    setCartItems((prev) => {
      const existingIndex = prev.findIndex(
        (item) =>
          item.productId === product.id &&
          item.selectedOptions.length === 0 &&
          !item.notes
      );
      if (existingIndex > -1) {
        const updated = [...prev];
        const current = updated[existingIndex];
        const nextQty = current.quantity + 1;
        updated[existingIndex] = {
          ...current,
          quantity: nextQty,
          totalCents: current.unitPriceCents * nextQty,
        };
        return updated;
      }
      return [
        ...prev,
        {
          productId: product.id,
          productName: product.name,
          unitPriceCents: product.priceCents,
          quantity: 1,
          selectedOptions: [],
          totalCents: product.priceCents,
        },
      ];
    });
    triggerAddedToast(product.name);
  };

  const handleQuickDecrementProduct = (product: Product, e: React.MouseEvent) => {
    e.stopPropagation();
    setCartItems((prev) => {
      const idx = prev.findIndex((item) => item.productId === product.id);
      if (idx === -1) return prev;
      const target = prev[idx];
      if (target.quantity <= 1) {
        return prev.filter((_, i) => i !== idx);
      }
      const singleUnitPrice = target.totalCents / target.quantity;
      const nextQty = target.quantity - 1;
      const updated = [...prev];
      updated[idx] = {
        ...target,
        quantity: nextQty,
        totalCents: Math.round(singleUnitPrice * nextQty),
      };
      return updated;
    });
  };

  const handleUpdateCartItemQuantity = (index: number, delta: number) => {
    setCartItems((prev) => {
      const target = prev[index];
      if (!target) return prev;
      const nextQty = target.quantity + delta;
      if (nextQty <= 0) {
        const filtered = prev.filter((_, i) => i !== index);
        if (filtered.length === 0) {
          setIsCartOpen(false);
          setCartStep('bag');
        }
        return filtered;
      }
      const singleUnitPrice = target.totalCents / target.quantity;
      const updated = [...prev];
      updated[index] = {
        ...target,
        quantity: nextQty,
        totalCents: Math.round(singleUnitPrice * nextQty),
      };
      return updated;
    });
  };

  const handleRemoveCartItem = (index: number) => {
    setCartItems((prev) => {
      const filtered = prev.filter((_, i) => i !== index);
      if (filtered.length === 0) {
        setIsCartOpen(false);
        setCartStep('bag');
      }
      return filtered;
    });
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

  // Add customized item to cart (keeps user on the menu so they can continue choosing products!)
  const handleAddToCart = (openBagImmediately = false) => {
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

    const cleanNotes = customizationNotes.trim() || undefined;
    const optionsKey = optionsSnapshot.map((o) => `${o.groupId}:${o.itemId}`).sort().join('|');

    setCartItems((prev) => {
      const existingIndex = prev.findIndex((item) => {
        const itemKey = item.selectedOptions
          .map((o) => `${o.groupId}:${o.itemId}`)
          .sort()
          .join('|');
        return (
          item.productId === activeProductForCustomization.id &&
          itemKey === optionsKey &&
          (item.notes || undefined) === cleanNotes
        );
      });

      if (existingIndex > -1) {
        const updated = [...prev];
        const existing = updated[existingIndex];
        const singlePrice = modalItemCalculatedPriceCents / customizationQuantity;
        const nextQty = existing.quantity + customizationQuantity;
        updated[existingIndex] = {
          ...existing,
          quantity: nextQty,
          totalCents: Math.round(singlePrice * nextQty),
        };
        return updated;
      }

      const orderItem: OrderItem = {
        productId: activeProductForCustomization.id,
        productName: activeProductForCustomization.name,
        unitPriceCents: activeProductForCustomization.priceCents,
        quantity: customizationQuantity,
        selectedOptions: optionsSnapshot,
        notes: cleanNotes,
        totalCents: modalItemCalculatedPriceCents,
      };
      return [...prev, orderItem];
    });

    const addedName = activeProductForCustomization.name;
    setActiveProductForCustomization(null);

    if (openBagImmediately) {
      setCartStep('bag');
      setIsCartOpen(true);
    } else {
      triggerAddedToast(addedName);
    }
  };

  // Cart totals with server recalculation simulation
  const cartSubtotalCents = useMemo(() => {
    return cartItems.reduce((acc, item) => acc + item.totalCents, 0);
  }, [cartItems]);

  const totalItemsInBag = useMemo(() => {
    return cartItems.reduce((acc, item) => acc + item.quantity, 0);
  }, [cartItems]);

  const selectedZone = activeDeliveryZones.find((z) => z.id === selectedZoneId);
  const deliveryFee = deliveryType === 'delivery'
    ? (selectedZone ? selectedZone.feeCents : tenant.deliveryFeeCents)
    : 0;
  const cartGrandTotalCents = cartSubtotalCents + deliveryFee;

  // Checkout submission (Real-time sync with backend + KDS)
  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCheckoutError(null);
    if (cartItems.length === 0) return;
    if (!customerName.trim()) {
      setCheckoutError('Por favor, informe seu nome para identificação do pedido.');
      return;
    }
    if (customerPhone.replace(/\D/g, '').length < 10) {
      setCheckoutError('Por favor, informe um WhatsApp válido com DDD para acompanhar o pedido.');
      return;
    }
    if (deliveryType === 'delivery' && !deliveryAddress.trim()) {
      setCheckoutError('Por favor, informe o endereço completo para entrega.');
      return;
    }
    if (deliveryType === 'delivery' && cartSubtotalCents < tenant.minOrderCents) {
      setCheckoutError(`O pedido mínimo para entrega é R$ ${(tenant.minOrderCents / 100).toFixed(2)}`);
      return;
    }
    if (deliveryType === 'dine_in' && !tableNumber.trim()) {
      setCheckoutError('Por favor, informe o número da sua mesa no salão.');
      return;
    }

    try {
      localStorage.setItem(
        'aladay_customer_profile',
        JSON.stringify({
          name: customerName.trim(),
          phone: customerPhone.trim(),
          address: deliveryAddress.trim(),
        })
      );
    } catch {
      // ignore storage errors
    }

    setIsSubmitting(true);

    const orderNumber = Math.floor(1043 + Math.random() * 8900);
    const isPixDynamic = paymentMethod.includes('Pix');
    const formattedTable = deliveryType === 'dine_in' ? tableNumber.trim().padStart(2, '0') : undefined;
    const nowTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const localOrder: Order = {
      id: `ord_${orderNumber}`,
      orderNumber,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      customerName: customerName.trim() || (formattedTable ? `Mesa ${formattedTable}` : 'Cliente'),
      customerPhone: (customerPhone.trim() || tenant.phone).replace(/\D/g, ''),
      type: deliveryType,
      tableNumber: formattedTable,
      deliveryAddress:
        deliveryType === 'delivery'
          ? deliveryAddress.trim()
          : formattedTable
          ? `Mesa ${formattedTable} (Salão)`
          : undefined,
      deliveryZoneName: selectedZone?.name,
      estimatedMinutes: deliveryType === 'dine_in' ? 15 : selectedZone?.estimatedMinutes || 35,
      items: [...cartItems],
      subtotalCents: cartSubtotalCents,
      deliveryFeeCents: deliveryFee,
      totalCents: cartGrandTotalCents,
      status: isPixDynamic ? 'received' : 'confirmed',
      paymentStatus: 'pending',
      paymentMethod: isPixDynamic
        ? 'Pix'
        : paymentMethod === 'Dinheiro' && cashChangeFor.trim()
        ? `Dinheiro (Troco: ${cashChangeFor.trim()})`
        : paymentMethod,
      whatsAppStatus: 'delivered',
      whatsAppLogs: [
        {
          timestamp: new Date().toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
          event: 'order.created',
          detail: `Pedido #${orderNumber} recebido via Cardápio Digital${
            formattedTable ? ` (Mesa ${formattedTable})` : ''
          } (${isPixDynamic ? 'Pix' : paymentMethod}).`,
        },
      ],
      createdAt: nowTime,
      updatedAt: nowTime,
    };

    let finalOrder: Order = localOrder;

    try {
      const response = await fetch('/api/v1/orders/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...localOrder,
          tenantName: tenant.name,
          tenantPhone: tenant.phone,
          idempotencyKey: `${tenant.slug}_${localOrder.id}_${Date.now()}`,
        }),
      });
      if (response.ok) {
        const json = await response.json();
        if (json?.data) {
          finalOrder = {
            ...localOrder,
            ...json.data,
          };
        }
      }
    } catch {
      // Fallback to localOrder if offline
    }

    onOrderCreated(finalOrder);
    setLastPlacedOrder(finalOrder);
    setCartItems([]);
    setCashChangeFor('');
    setCartStep('bag');
    setIsSubmitting(false);
    setIsCartOpen(false);

    if (isPixDynamic) {
      setActivePixOrder(finalOrder);
    }
  };

  const formatBRL = (cents: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
  };

  return (
    <div className="max-w-md mx-auto bg-white border border-neutral-300 rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-[720px] relative">
      {/* Top Bar do Cardápio Digital com Horário de Funcionamento e Status em Tempo Real */}
      <div className="bg-neutral-900 text-white text-[11px] px-3.5 py-2 flex items-center justify-between gap-2 select-none">
        <div className="flex items-center gap-1.5 min-w-0">
          <Clock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="font-medium text-neutral-100 truncate" title={tenant.openingHoursText}>
            {tenant.openingHoursText || 'Segunda a Domingo: 18:00 às 23:45'}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="font-mono text-[10px] text-neutral-400 hidden sm:inline">
            Agora: {currentTimeStr}
          </span>
          {canConfigureSchedule && onUpdateTenant && (
            <button
              type="button"
              onClick={() => setIsScheduleModalOpen(true)}
              className="px-2 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-amber-300 border border-neutral-700 text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
              title="Configurar horário de funcionamento e status na barra superior"
            >
              <Settings className="w-3 h-3" />
              <span>Horário</span>
            </button>
          )}
          <span
            onClick={() => {
              if (canConfigureSchedule && onUpdateTenant) setIsScheduleModalOpen(true);
            }}
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 ${
              canConfigureSchedule && onUpdateTenant ? 'cursor-pointer hover:opacity-90' : ''
            } ${
              tenant.isOpen
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                tenant.isOpen ? 'bg-emerald-400' : 'bg-rose-400'
              }`}
            />
            <span>{tenant.isOpen ? 'Aberto' : 'Fechado'}</span>
          </span>
        </div>
      </div>

      {/* Restaurant Header */}
      <div
        className="p-5 text-white relative"
        style={{ backgroundColor: tenant.primaryColor }}
      >
        {/* Top Row: Badge + Share & Open Status */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] uppercase font-extrabold tracking-wider bg-black/15 px-2.5 py-1 rounded-md whitespace-nowrap">
            Cardápio Digital Oficial
          </span>

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
            <button
              type="button"
              onClick={() => {
                if (canConfigureSchedule && onUpdateTenant) {
                  setIsScheduleModalOpen(true);
                }
              }}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 backdrop-blur-xs transition-opacity ${
                canConfigureSchedule && onUpdateTenant ? 'cursor-pointer hover:opacity-90' : 'cursor-default'
              } ${
                tenant.isOpen
                  ? 'bg-white/20 text-white'
                  : 'bg-neutral-950/50 text-rose-200 border border-white/20'
              }`}
              title={
                canConfigureSchedule && onUpdateTenant
                  ? 'Clique para alterar o horário de funcionamento ou abrir/fechar a loja'
                  : undefined
              }
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  tenant.isOpen ? 'bg-emerald-300' : 'bg-rose-400'
                }`}
              />
              <span>{tenant.isOpen ? 'Aberto' : 'Fechado'}</span>
            </button>
          </div>
        </div>

        {/* Full-Width Restaurant Title & Logo (Sem corte/truncamento) */}
        <div className="mt-2.5 flex items-center gap-3">
          {tenant.logoUrl ? (
            <img
              src={tenant.logoUrl}
              alt={tenant.name}
              className="w-12 h-12 rounded-xl object-cover bg-white/20 border border-white/30 shrink-0 shadow-xs"
            />
          ) : (
            <div className="w-11 h-11 rounded-xl bg-black/20 border border-white/25 flex items-center justify-center text-white font-extrabold text-sm shrink-0">
              {tenant.name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <h1 className="text-xl font-extrabold leading-snug break-words min-w-0">
            {tenant.name}
          </h1>
        </div>

        {/* Full-Width Opening Hours Bar inside Header */}
        <div className="mt-2 bg-black/15 rounded-xl px-3 py-2 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <Clock className="w-4 h-4 shrink-0 text-white/90" />
            <span className="font-medium text-white/95 leading-snug">
              {tenant.openingHoursText || 'Segunda a Domingo: 18:00 às 23:45'}
            </span>
          </div>
          {canConfigureSchedule && onUpdateTenant && (
            <button
              type="button"
              onClick={() => setIsScheduleModalOpen(true)}
              className="px-2.5 py-1 rounded-lg bg-white text-neutral-900 hover:bg-neutral-100 text-[11px] font-bold shrink-0 flex items-center gap-1 cursor-pointer shadow-2xs"
            >
              <Settings className="w-3 h-3 text-blue-600" />
              <span>Editar Horário</span>
            </button>
          )}
        </div>

        <div className="mt-3 pt-3 border-t border-white/20 flex items-center justify-between text-xs opacity-95">
          <span className="flex items-center gap-1 font-medium">
            <MapPin className="w-3.5 h-3.5" />
            <span>Entrega: {formatBRL(tenant.deliveryFeeCents)}</span>
          </span>
          <span className="font-medium">Mínimo: {formatBRL(tenant.minOrderCents)}</span>
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

        {/* Table QR Code Active Banner */}
        {deliveryType === 'dine_in' && tableNumber && (
          <div className="mt-3 pt-2.5 border-t border-white/20 flex items-center justify-between gap-2 bg-amber-500/20 px-3 py-2 rounded-lg">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <span>🍽️ Você está pedindo na MESA #{tableNumber}</span>
            </span>
            <span className="text-[10px] font-mono bg-white text-neutral-900 px-2 py-0.5 rounded font-bold">
              Taxa Zero • Direto p/ Cozinha
            </span>
          </div>
        )}
      </div>

      {/* Modal Rápido para Configurar Horário do Cardápio na Barra Superior */}
      {isScheduleModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-neutral-200 space-y-4 animate-in fade-in duration-150">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-neutral-900">
                    Horário do Cardápio na Barra Superior
                  </h3>
                  <p className="text-[11px] text-neutral-500">
                    Configure os dias, horários de atendimento e status da loja
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsScheduleModalOpen(false)}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTopBarSchedule} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1.5">
                  Status Atual do Cardápio Digital
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setScheduleIsOpen(true)}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                      scheduleIsOpen
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-800 shadow-2xs'
                        : 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>Aberto Agora</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setScheduleIsOpen(false)}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                      !scheduleIsOpen
                        ? 'bg-rose-50 border-rose-500 text-rose-800 shadow-2xs'
                        : 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                    <span>Fechado</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1.5">
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
                        setScheduleDaysPreset(preset);
                        setScheduleCustomText(`${preset}: ${scheduleStartTime} às ${scheduleEndTime}`);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border cursor-pointer transition-colors ${
                        scheduleDaysPreset === preset
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-neutral-50 text-neutral-700 border-neutral-200 hover:bg-neutral-100'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1">
                    Abre às
                  </label>
                  <input
                    type="time"
                    value={scheduleStartTime}
                    onChange={(e) => {
                      const nextStart = e.target.value;
                      setScheduleStartTime(nextStart);
                      setScheduleCustomText(`${scheduleDaysPreset}: ${nextStart} às ${scheduleEndTime}`);
                    }}
                    className="w-full p-2 text-xs font-mono border border-neutral-300 rounded-xl text-neutral-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1">
                    Fecha às
                  </label>
                  <input
                    type="time"
                    value={scheduleEndTime}
                    onChange={(e) => {
                      const nextEnd = e.target.value;
                      setScheduleEndTime(nextEnd);
                      setScheduleCustomText(`${scheduleDaysPreset}: ${scheduleStartTime} às ${nextEnd}`);
                    }}
                    className="w-full p-2 text-xs font-mono border border-neutral-300 rounded-xl text-neutral-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  Texto Exibido na Barra Superior do Cardápio
                </label>
                <input
                  type="text"
                  required
                  value={scheduleCustomText}
                  onChange={(e) => setScheduleCustomText(e.target.value)}
                  placeholder="Segunda a Domingo: 18:00 às 23:45"
                  className="w-full p-2.5 text-xs border border-neutral-300 rounded-xl text-neutral-900 font-medium"
                />
              </div>

              {scheduleSavedToast && (
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>Horário atualizado na barra superior com sucesso!</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setIsScheduleModalOpen(false)}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-neutral-600 hover:bg-neutral-100 cursor-pointer"
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

      {/* If Order Placed: Confirmation Screen */}
      {lastPlacedOrder ? (
        <div className="p-6 flex-1 flex flex-col items-center justify-center text-center space-y-4">
          <div className="w-14 h-14 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center shadow-xs">
            <Check className="w-7 h-7 stroke-[3]" />
          </div>

          <div>
            <span className="text-xs text-neutral-500 font-mono font-bold">
              Pedido #{lastPlacedOrder.orderNumber}
            </span>
            <h2 className="text-xl font-bold text-neutral-900 mt-0.5">Pedido Enviado com Sucesso!</h2>
            <p className="text-xs text-neutral-600 mt-1 max-w-xs mx-auto leading-relaxed">
              Seu pedido já foi recebido pelo <strong>{tenant.name}</strong>. Você pode acompanhar o status do preparo em tempo real abaixo.
            </p>
          </div>

          {/* Customer Order Summary Box */}
          <div className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-3.5 text-left space-y-2 text-xs">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
              <span className="font-bold text-neutral-800">{tenant.name}</span>
              <span className="font-mono font-bold text-emerald-700">
                Total: {formatBRL(lastPlacedOrder.totalCents)}
              </span>
            </div>
            <div className="space-y-1 text-[11px] text-neutral-600">
              <p>
                <strong>Cliente:</strong> {lastPlacedOrder.customerName}
              </p>
              <p>
                <strong>Modalidade:</strong>{' '}
                {lastPlacedOrder.type === 'delivery'
                  ? `Entrega (${lastPlacedOrder.deliveryAddress || 'Endereço informado'})`
                  : lastPlacedOrder.type === 'dine_in'
                  ? `Consumo no Salão (Mesa ${lastPlacedOrder.tableNumber || ''})`
                  : 'Retirada no Balcão'}
              </p>
              <p>
                <strong>Pagamento:</strong>{' '}
                {lastPlacedOrder.paymentStatus === 'paid_online'
                  ? 'Pix Confirmado'
                  : lastPlacedOrder.paymentMethod}
              </p>
            </div>
          </div>

          <div className="w-full border-t border-neutral-200 pt-3 flex flex-col gap-2">
            {lastPlacedOrder.paymentMethod.includes('Pix') && (
              <button
                type="button"
                onClick={() => setActivePixOrder(lastPlacedOrder)}
                className={`w-full py-2.5 px-4 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 shadow-xs cursor-pointer ${
                  lastPlacedOrder.paymentStatus === 'paid_online'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
              >
                <Zap className="w-3.5 h-3.5 text-amber-300" />
                <span>
                  {lastPlacedOrder.paymentStatus === 'paid_online'
                    ? '✓ Pagamento Pix Confirmado (Ver Comprovante)'
                    : 'Pagar Agora com Pix (QR Code / Copia e Cola)'}
                </span>
              </button>
            )}

            {onViewTracking && (
              <button
                type="button"
                onClick={() => onViewTracking(lastPlacedOrder)}
                className="w-full py-2.5 px-4 text-xs font-bold text-white bg-neutral-900 hover:bg-neutral-800 rounded-xl transition-colors flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>Acompanhar Status do Pedido em Tempo Real</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            <a
              href={`https://wa.me/${tenant.phone.replace(/\D/g, '').startsWith('55') ? tenant.phone.replace(/\D/g, '') : `55${tenant.phone.replace(/\D/g, '')}`}?text=${encodeURIComponent(`Olá! Acabei de fazer o pedido #${lastPlacedOrder.orderNumber} pelo cardápio digital do ${tenant.name}. Total: ${formatBRL(lastPlacedOrder.totalCents)}.`)}`}
              target="_blank"
              rel="noreferrer"
              className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors flex items-center justify-center gap-1.5 shadow-xs"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Falar com o Restaurante no WhatsApp</span>
              <ExternalLink className="w-3 h-3 opacity-80" />
            </a>

            <button
              type="button"
              onClick={() => setLastPlacedOrder(null)}
              className="w-full py-2.5 px-3 text-xs font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-xl transition-colors cursor-pointer"
            >
              Voltar ao Cardápio / Novo Pedido
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Step Guide Banner + Search Bar */}
          <div className="bg-neutral-50 border-b border-neutral-200 px-3.5 pt-2.5 pb-2 space-y-2 shrink-0">
            <div className="flex items-center justify-between text-[11px] text-neutral-600">
              <span className="font-semibold flex items-center gap-1.5 text-neutral-800">
                <ShoppingBag className="w-3.5 h-3.5 text-emerald-600" />
                <span>1. Escolha seus produtos</span>
                <span className="text-neutral-300">&rarr;</span>
                <span className="text-neutral-500">2. Revise a sacola</span>
                <span className="text-neutral-300">&rarr;</span>
                <span className="text-neutral-500">3. Finalize</span>
              </span>
              {totalItemsInBag > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setCartStep('bag');
                    setIsCartOpen(true);
                  }}
                  className="text-[11px] font-bold text-emerald-700 hover:underline cursor-pointer"
                >
                  {totalItemsInBag} {totalItemsInBag === 1 ? 'item' : 'itens'}
                </button>
              )}
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar prato, bebida ou ingrediente..."
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-neutral-200 rounded-lg text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-400"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 p-0.5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Category Tabs */}
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar pt-0.5">
              <button
                type="button"
                onClick={() => setSelectedCategoryId('ALL')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors cursor-pointer ${
                  selectedCategoryId === 'ALL'
                    ? 'bg-neutral-900 text-white shadow-2xs'
                    : 'text-neutral-600 hover:text-neutral-900 bg-white border border-neutral-200'
                }`}
              >
                Todos ({products.length})
              </button>
              {sortedCategories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategoryId(cat.id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors cursor-pointer ${
                    selectedCategoryId === cat.id
                      ? 'bg-neutral-900 text-white shadow-2xs'
                      : 'text-neutral-600 hover:text-neutral-900 bg-white border border-neutral-200'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          {/* Toast feedback when product is added */}
          {addedToastMessage && (
            <div className="mx-4 mt-2.5 px-3 py-2 rounded-xl bg-emerald-950 text-white text-xs font-semibold flex items-center justify-between gap-2 shadow-md animate-in fade-in duration-150">
              <div className="flex items-center gap-1.5 min-w-0">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="truncate">{addedToastMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAddedToastMessage(null);
                  setCartStep('bag');
                  setIsCartOpen(true);
                }}
                className="text-[11px] font-bold text-emerald-300 hover:text-white underline shrink-0 cursor-pointer"
              >
                Ver Sacola
              </button>
            </div>
          )}

          {/* Product List */}
          <div className="p-4 space-y-3 flex-1 overflow-y-auto">
            {filteredProducts.length === 0 ? (
              <div className="text-center py-10 space-y-2">
                <p className="text-xs font-semibold text-neutral-600">
                  Nenhum produto encontrado para essa busca.
                </p>
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="text-xs font-bold text-blue-600 underline cursor-pointer"
                  >
                    Limpar busca
                  </button>
                )}
              </div>
            ) : (
              filteredProducts.map((product) => {
                const qtyInCart = cartItems
                  .filter((item) => item.productId === product.id)
                  .reduce((sum, item) => sum + item.quantity, 0);

                return (
                  <div
                    key={product.id}
                    onClick={() => handleOpenProduct(product)}
                    className={`p-3 border rounded-xl transition-all flex gap-3 cursor-pointer bg-white group relative ${
                      qtyInCart > 0
                        ? 'border-emerald-500/70 bg-emerald-50/15 shadow-2xs'
                        : 'border-neutral-200 hover:border-neutral-300'
                    }`}
                  >
                    {/* Image */}
                    {product.imageUrl ? (
                      <div className="relative shrink-0">
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          className="w-20 h-20 rounded-lg object-cover bg-neutral-100"
                        />
                        {qtyInCart > 0 && (
                          <span className="absolute -top-1.5 -left-1.5 bg-emerald-600 text-white text-[10px] font-mono font-extrabold px-1.5 py-0.5 rounded-full shadow-xs">
                            {qtyInCart}x
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="w-20 h-20 rounded-lg bg-neutral-100 flex items-center justify-center shrink-0 text-neutral-400 text-xs relative">
                        <span>Sem foto</span>
                        {qtyInCart > 0 && (
                          <span className="absolute -top-1.5 -left-1.5 bg-emerald-600 text-white text-[10px] font-mono font-extrabold px-1.5 py-0.5 rounded-full shadow-xs">
                            {qtyInCart}x
                          </span>
                        )}
                      </div>
                    )}

                    <div className="flex-1 flex flex-col justify-between min-w-0">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-xs font-bold text-neutral-900 leading-snug group-hover:text-blue-600 transition-colors">
                            {product.name}
                          </h3>
                        </div>
                        <p className="text-[11px] text-neutral-500 line-clamp-2 mt-1 leading-normal">
                          {product.description}
                        </p>
                      </div>

                      <div className="flex items-center justify-between mt-2.5 gap-2">
                        <span className="text-xs font-mono font-bold text-neutral-900 tabular-nums">
                          {formatBRL(product.priceCents)}
                        </span>

                        {qtyInCart > 0 && !product.optionGroups?.some((g) => g.required) ? (
                          <div
                            className="flex items-center gap-1 bg-neutral-900 text-white rounded-lg p-0.5 shadow-2xs"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={(e) => handleQuickDecrementProduct(product, e)}
                              className="w-6 h-6 rounded-md hover:bg-white/15 flex items-center justify-center transition-colors cursor-pointer"
                              title="Diminuir quantidade"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="px-1.5 text-xs font-mono font-bold tabular-nums">
                              {qtyInCart}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => handleQuickAddProduct(product, e)}
                              className="w-6 h-6 rounded-md hover:bg-white/15 flex items-center justify-center transition-colors cursor-pointer"
                              title="Adicionar mais um"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => handleQuickAddProduct(product, e)}
                            className="text-[11px] font-bold text-white px-3 py-1.5 rounded-lg flex items-center gap-1 shadow-2xs transition-transform active:scale-95 cursor-pointer"
                            style={{ backgroundColor: tenant.primaryColor }}
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Adicionar</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Sticky Bottom Bag Bar (Appears when customer has items in bag) */}
          {cartItems.length > 0 && (
            <div className="p-3 bg-white border-t border-neutral-200 shrink-0 shadow-lg">
              <button
                type="button"
                onClick={() => {
                  setCartStep('bag');
                  setIsCartOpen(true);
                }}
                className="w-full flex items-center justify-between p-3.5 rounded-xl text-white font-bold text-xs shadow-md transition-transform active:scale-[0.99] cursor-pointer"
                style={{ backgroundColor: tenant.primaryColor }}
              >
                <div className="flex items-center gap-2.5">
                  <div className="bg-black/25 px-2.5 py-1 rounded-lg font-mono font-extrabold text-white flex items-center gap-1">
                    <ShoppingBag className="w-3.5 h-3.5" />
                    <span>{totalItemsInBag}</span>
                  </div>
                  <div className="text-left">
                    <span className="block text-xs font-extrabold leading-tight">
                      Ver Sacola e Finalizar
                    </span>
                    <span className="block text-[10px] font-normal text-white/85">
                      Confira seus itens antes de preencher seus dados
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="font-mono font-extrabold text-sm tabular-nums">
                    {formatBRL(cartSubtotalCents)}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </div>
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
                  Preço base: {formatBRL(activeProductForCustomization.priceCents)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveProductForCustomization(null)}
                className="text-xs font-medium text-neutral-500 hover:text-neutral-900 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4 flex-1">
              {activeProductForCustomization.description && (
                <p className="text-xs text-neutral-600 leading-relaxed bg-neutral-50 p-2.5 rounded-lg border border-neutral-100">
                  {activeProductForCustomization.description}
                </p>
              )}

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
                  Alguma observação para a cozinha? (Opcional)
                </label>
                <textarea
                  value={customizationNotes}
                  onChange={(e) => setCustomizationNotes(e.target.value)}
                  placeholder="Ex: sem cebola, ponto bem passado, maionese à parte..."
                  rows={2}
                  className="w-full p-2.5 text-xs border border-neutral-200 rounded-lg text-neutral-800 focus:outline-none focus:ring-1 focus:ring-neutral-400"
                />
              </div>
            </div>

            {/* Modal Bottom Actions */}
            <div className="p-4 border-t border-neutral-200 space-y-2 bg-white">
              <div className="flex items-center gap-3">
                <div className="flex items-center border border-neutral-300 rounded-xl overflow-hidden shrink-0">
                  <button
                    type="button"
                    onClick={() => setCustomizationQuantity(Math.max(1, customizationQuantity - 1))}
                    className="p-2.5 text-neutral-600 hover:bg-neutral-100 cursor-pointer"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="px-3.5 text-xs font-mono font-bold text-neutral-900 tabular-nums">
                    {customizationQuantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCustomizationQuantity(customizationQuantity + 1)}
                    className="p-2.5 text-neutral-600 hover:bg-neutral-100 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => handleAddToCart(false)}
                  className="flex-1 py-3 px-4 rounded-xl text-white font-bold text-xs flex items-center justify-between transition-opacity hover:opacity-95 shadow-xs cursor-pointer"
                  style={{ backgroundColor: tenant.primaryColor }}
                >
                  <span>Adicionar à Sacola</span>
                  <span className="font-mono font-extrabold tabular-nums">
                    {formatBRL(modalItemCalculatedPriceCents)}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2-Step Cart Drawer: Step 1 (Sua Sacola) -> Step 2 (Seus Dados & Pagamento) */}
      {isCartOpen && (
        <div className="absolute inset-0 bg-black/60 z-40 flex flex-col justify-end animate-fadeIn">
          <div className="bg-white rounded-t-2xl max-h-[92%] flex flex-col overflow-hidden shadow-2xl">
            {/* Drawer Header with Step Indicator */}
            <div className="p-4 border-b border-neutral-200 space-y-3 bg-neutral-50/70">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {cartStep === 'checkout' ? (
                    <button
                      type="button"
                      onClick={() => {
                        setCheckoutError(null);
                        setCartStep('bag');
                      }}
                      className="p-1.5 rounded-lg bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-100 cursor-pointer flex items-center gap-1 text-xs font-bold"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Sacola</span>
                    </button>
                  ) : (
                    <div className="w-7 h-7 rounded-lg bg-neutral-900 text-white flex items-center justify-center">
                      <ShoppingBag className="w-3.5 h-3.5" />
                    </div>
                  )}
                  <div>
                    <h3 className="text-sm font-extrabold text-neutral-900">
                      {cartStep === 'bag'
                        ? '1. Sua Sacola de Compras'
                        : '2. Seus Dados e Pagamento'}
                    </h3>
                    <p className="text-[11px] text-neutral-500">
                      {cartStep === 'bag'
                        ? 'Confira as quantidades ou adicione mais itens antes de finalizar'
                        : 'Preencha onde entregar e escolha como prefere pagar'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCartOpen(false)}
                  className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-900 hover:bg-neutral-200/60 cursor-pointer"
                  title="Fechar e voltar ao cardápio"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 2-Step Progress Bar */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCartStep('bag')}
                  className={`py-1.5 px-2.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                    cartStep === 'bag'
                      ? 'bg-neutral-900 text-white border-neutral-900'
                      : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  }`}
                >
                  <ShoppingBag className="w-3 h-3" />
                  <span>1. Sacola ({totalItemsInBag})</span>
                  {cartStep === 'checkout' && <Check className="w-3 h-3 text-emerald-600" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (cartItems.length > 0) setCartStep('checkout');
                  }}
                  className={`py-1.5 px-2.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                    cartStep === 'checkout'
                      ? 'bg-neutral-900 text-white border-neutral-900'
                      : 'bg-white text-neutral-500 border-neutral-200 hover:text-neutral-800'
                  }`}
                >
                  <UserCheck className="w-3 h-3" />
                  <span>2. Seus Dados &amp; Entrega</span>
                </button>
              </div>
            </div>

            {cartStep === 'bag' ? (
              /* ============================================================ */
              /* ETAPA 1: REVISÃO DA SACOLA DE PRODUTOS                       */
              /* ============================================================ */
              <div className="flex-1 overflow-y-auto p-4 flex flex-col justify-between space-y-4">
                <div className="space-y-2.5">
                  {cartItems.map((item, idx) => (
                    <div
                      key={`${item.productId}_${idx}`}
                      className="p-3 rounded-xl border border-neutral-200 bg-white flex items-start justify-between gap-3 shadow-2xs"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="text-xs font-bold text-neutral-900 leading-snug">
                          {item.productName}
                        </p>
                        {item.selectedOptions.length > 0 && (
                          <div className="space-y-0.5">
                            {item.selectedOptions.map((opt, oIdx) => (
                              <p key={oIdx} className="text-[11px] text-neutral-500">
                                + {opt.itemName}{' '}
                                {opt.priceCents > 0 && `(${formatBRL(opt.priceCents)})`}
                              </p>
                            ))}
                          </div>
                        )}
                        {item.notes && (
                          <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200/70 rounded px-2 py-0.5 inline-block">
                            Obs: {item.notes}
                          </p>
                        )}
                        <p className="text-xs font-mono font-bold text-emerald-700 pt-0.5 tabular-nums">
                          {formatBRL(item.totalCents)}
                        </p>
                      </div>

                      {/* Quantity Stepper & Delete inside Bag */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <div className="flex items-center border border-neutral-300 rounded-lg overflow-hidden bg-neutral-50">
                          <button
                            type="button"
                            onClick={() => handleUpdateCartItemQuantity(idx, -1)}
                            className="p-1.5 text-neutral-700 hover:bg-neutral-200 transition-colors cursor-pointer"
                            title="Diminuir quantidade"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="px-2.5 text-xs font-mono font-bold text-neutral-900 tabular-nums">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleUpdateCartItemQuantity(idx, 1)}
                            className="p-1.5 text-neutral-700 hover:bg-neutral-200 transition-colors cursor-pointer"
                            title="Aumentar quantidade"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveCartItem(idx)}
                          className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Remover item da sacola"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Button to keep shopping and add more products */}
                  <button
                    type="button"
                    onClick={() => setIsCartOpen(false)}
                    className="w-full py-2.5 px-3 rounded-xl border border-dashed border-neutral-300 hover:border-neutral-400 bg-neutral-50 hover:bg-neutral-100 text-neutral-700 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Continuar Comprando / Adicionar Mais Produtos</span>
                  </button>
                </div>

                {/* Bag Footer: Subtotal + Proceed to Customer Info */}
                <div className="border-t border-neutral-200 pt-3 space-y-3">
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between text-neutral-600">
                      <span>Itens na sacola ({totalItemsInBag})</span>
                      <span className="font-mono font-bold text-neutral-900 tabular-nums">
                        {formatBRL(cartSubtotalCents)}
                      </span>
                    </div>
                    {tenant.minOrderCents > 0 && cartSubtotalCents < tenant.minOrderCents && (
                      <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                        Pedido mínimo para Delivery: <strong>{formatBRL(tenant.minOrderCents)}</strong> (faltam{' '}
                        <strong>{formatBRL(tenant.minOrderCents - cartSubtotalCents)}</strong>).
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setCheckoutError(null);
                      setCartStep('checkout');
                    }}
                    className="w-full py-3.5 px-4 rounded-xl text-white font-bold text-xs flex items-center justify-between shadow-md transition-opacity hover:opacity-95 cursor-pointer"
                    style={{ backgroundColor: tenant.primaryColor }}
                  >
                    <span>Finalizar Pedido (Preencher Dados)</span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-extrabold tabular-nums">
                        {formatBRL(cartSubtotalCents)}
                      </span>
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  </button>
                </div>
              </div>
            ) : (
              /* ============================================================ */
              /* ETAPA 2: MODALIDADE, DADOS DO CLIENTE E FORMA DE PAGAMENTO   */
              /* ============================================================ */
              <form onSubmit={handleCheckoutSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Compact Bag Summary Banner */}
                <div className="p-2.5 rounded-xl bg-neutral-50 border border-neutral-200 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <ShoppingBag className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span className="font-medium text-neutral-700 truncate">
                      <strong>{totalItemsInBag}</strong> {totalItemsInBag === 1 ? 'item selecionado' : 'itens selecionados'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCartStep('bag')}
                    className="text-[11px] font-bold text-blue-600 hover:underline shrink-0 cursor-pointer"
                  >
                    Revisar itens ({formatBRL(cartSubtotalCents)})
                  </button>
                </div>

                {/* Delivery vs Pickup vs Dine-In Selector */}
                <div>
                  <label className="block text-xs font-bold text-neutral-800 mb-1.5">
                    Como você deseja receber seu pedido?
                  </label>
                  <div className="grid grid-cols-3 p-1 bg-neutral-100 rounded-xl text-xs font-medium gap-1">
                    <button
                      type="button"
                      onClick={() => setDeliveryType('delivery')}
                      className={`py-2 rounded-lg transition-colors cursor-pointer ${
                        deliveryType === 'delivery'
                          ? 'bg-white text-neutral-900 shadow-xs font-bold'
                          : 'text-neutral-600'
                      }`}
                    >
                      🛵 Delivery
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeliveryType('pickup')}
                      className={`py-2 rounded-lg transition-colors cursor-pointer ${
                        deliveryType === 'pickup'
                          ? 'bg-white text-neutral-900 shadow-xs font-bold'
                          : 'text-neutral-600'
                      }`}
                    >
                      🛍️ Balcão
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeliveryType('dine_in')}
                      className={`py-2 rounded-lg transition-colors cursor-pointer ${
                        deliveryType === 'dine_in'
                          ? 'bg-amber-600 text-white shadow-xs font-bold'
                          : 'text-neutral-600'
                      }`}
                    >
                      🍽️ Na Mesa
                    </button>
                  </div>
                </div>

                {deliveryType === 'dine_in' && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-amber-950">
                        🍽️ Número da sua Mesa no Salão *
                      </label>
                      <span className="text-[10px] font-mono font-semibold text-amber-800 bg-white px-2 py-0.5 rounded border border-amber-200">
                        Sem Taxa de Entrega
                      </span>
                    </div>
                    <select
                      value={tableNumber || '01'}
                      onChange={(e) => setTableNumber(e.target.value)}
                      className="w-full p-2 text-xs border border-amber-300 rounded-lg text-neutral-900 bg-white font-mono font-bold"
                    >
                      {Array.from({ length: tenant.tablesCount || 12 }, (_, idx) => {
                        const num = String(idx + 1).padStart(2, '0');
                        return (
                          <option key={num} value={num}>
                            Mesa {num}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}

                {/* Customer Inputs */}
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-xs font-bold text-neutral-700 mb-1">
                        Seu Nome *
                      </label>
                      <input
                        type="text"
                        required
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="Ex: João Silva"
                        className="w-full p-2.5 text-xs border border-neutral-300 rounded-lg text-neutral-800 focus:outline-none focus:border-neutral-900"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-neutral-700 mb-1">
                        Seu WhatsApp (com DDD) *
                      </label>
                      <input
                        type="tel"
                        required
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="Ex: 91988887777"
                        className="w-full p-2.5 text-xs border border-neutral-300 rounded-lg text-neutral-800 font-mono focus:outline-none focus:border-neutral-900"
                      />
                    </div>
                  </div>

                  {deliveryType === 'delivery' && (
                    <>
                      {activeDeliveryZones.length > 0 && (
                        <div>
                          <label className="block text-xs font-bold text-neutral-700 mb-1 flex items-center justify-between">
                            <span>Bairro / Região de Entrega</span>
                            <span className="text-[10px] text-emerald-700 font-semibold font-mono">
                              {selectedZone
                                ? `Taxa: ${formatBRL(selectedZone.feeCents)} (~${selectedZone.estimatedMinutes} min)`
                                : ''}
                            </span>
                          </label>
                          <select
                            value={selectedZoneId}
                            onChange={(e) => setSelectedZoneId(e.target.value)}
                            className="w-full p-2.5 text-xs border border-neutral-300 rounded-lg text-neutral-800 bg-white"
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
                        <label className="block text-xs font-bold text-neutral-700 mb-1">
                          Endereço de Entrega Completo *
                        </label>
                        <input
                          type="text"
                          required
                          value={deliveryAddress}
                          onChange={(e) => setDeliveryAddress(e.target.value)}
                          placeholder="Rua, Número, Bairro e Ponto de Referência"
                          className="w-full p-2.5 text-xs border border-neutral-300 rounded-lg text-neutral-800 focus:outline-none focus:border-neutral-900"
                        />
                      </div>
                    </>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-neutral-700 mb-1">
                      Forma de Pagamento
                    </label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="w-full p-2.5 text-xs border border-emerald-300 rounded-lg text-neutral-800 bg-white font-medium focus:outline-emerald-600"
                    >
                      <option value="⚡ Pix Instantâneo (Aprovação Automática)">
                        ⚡ Pix Instantâneo (QR Code / Copia e Cola)
                      </option>
                      <option value="Pix no Recebimento">Pix na Entrega / Retirada</option>
                      <option value="Cartão de Crédito na Entrega">
                        Cartão de Crédito na Maquininha
                      </option>
                      <option value="Cartão de Débito">Cartão de Débito</option>
                      <option value="Dinheiro">Dinheiro</option>
                    </select>

                    {paymentMethod === 'Dinheiro' && (
                      <div className="mt-2">
                        <label className="block text-[11px] font-semibold text-neutral-600 mb-1">
                          Precisa de troco para quanto? (Opcional)
                        </label>
                        <input
                          type="text"
                          value={cashChangeFor}
                          onChange={(e) => setCashChangeFor(e.target.value)}
                          placeholder="Ex: Troco para R$ 50,00 (ou deixe em branco)"
                          className="w-full p-2 text-xs border border-neutral-300 rounded-lg text-neutral-800"
                        />
                      </div>
                    )}

                    {paymentMethod.includes('Pix') && (
                      <div className="mt-2 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-900 space-y-1">
                        <div className="flex items-center justify-between font-bold">
                          <span className="flex items-center gap-1">
                            <QrCode className="w-3.5 h-3.5 text-emerald-600" />
                            <span>QR Code Pix Direto do Restaurante</span>
                          </span>
                          <span className="text-[10px] font-mono bg-white px-1.5 py-0.5 rounded border border-emerald-200 text-emerald-700">
                            Conta da Loja
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
                    <span>Subtotal ({totalItemsInBag} {totalItemsInBag === 1 ? 'item' : 'itens'})</span>
                    <span className="font-mono tabular-nums">{formatBRL(cartSubtotalCents)}</span>
                  </div>
                  <div className="flex justify-between text-neutral-600">
                    <span>Taxa de Entrega</span>
                    <span className="font-mono tabular-nums">
                      {deliveryFee === 0 ? 'Grátis' : formatBRL(deliveryFee)}
                    </span>
                  </div>
                  <div className="flex justify-between text-neutral-900 font-extrabold text-sm pt-1.5 border-t border-neutral-100">
                    <span>Total a Pagar</span>
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
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setCartStep('bag')}
                    className="py-3 px-3.5 rounded-xl border border-neutral-300 text-neutral-700 hover:bg-neutral-100 font-bold text-xs cursor-pointer"
                  >
                    Voltar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 py-3.5 px-4 rounded-xl text-white font-bold text-xs flex items-center justify-center gap-2 transition-opacity hover:opacity-95 disabled:opacity-50 shadow-md cursor-pointer"
                    style={{ backgroundColor: tenant.primaryColor }}
                  >
                    {isSubmitting ? (
                      <span>Enviando pedido...</span>
                    ) : (
                      <>
                        <span>Confirmar e Enviar Pedido ({formatBRL(cartGrandTotalCents)})</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
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

