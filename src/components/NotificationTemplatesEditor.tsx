import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Send,
  Sparkles,
  RotateCcw,
  CheckCircle2,
  Phone,
  Smartphone,
  Copy,
  Check,
  Clock,
  Bike,
  PackageCheck,
  AlertTriangle,
  Flame,
  ChefHat,
  ShoppingBag,
  ExternalLink,
  ChevronRight,
  Info,
  Terminal,
  Zap,
  ArrowRight
} from 'lucide-react';
import { Order, RestaurantTenant } from '../types';

interface NotificationTemplatesEditorProps {
  tenant: RestaurantTenant;
  orders: Order[];
  onUpdateTenant?: (updatedTenant: RestaurantTenant) => void;
  onNavigateToLogs?: () => void;
}

type TemplateKey = 'confirmed' | 'preparing' | 'ready_delivery' | 'ready_pickup' | 'delivered' | 'cancelled';

interface TemplateMeta {
  key: TemplateKey;
  label: string;
  badge: string;
  badgeColor: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  triggerEvent: string;
}

const TEMPLATE_META: TemplateMeta[] = [
  {
    key: 'confirmed',
    label: '1. Pedido Confirmado',
    badge: 'KDS: Aceitar Pedido',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    icon: CheckCircle2,
    description: 'Enviada assim que a cozinha aceita o pedido e envia para a fila de produção.',
    triggerEvent: 'Status alterado de "received" para "confirmed"',
  },
  {
    key: 'preparing',
    label: '2. Em Preparo na Cozinha',
    badge: 'KDS: Iniciar Preparo',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
    icon: Flame,
    description: 'Enviada quando os chefs começam a montar os lanches ou pizzas na chapa/forno.',
    triggerEvent: 'Status alterado de "confirmed" para "preparing"',
  },
  {
    key: 'ready_delivery',
    label: '3. Saiu para Entrega (Delivery)',
    badge: 'KDS: Despachar Motoboy',
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
    icon: Bike,
    description: 'Enviada para pedidos com entrega quando o motoboy retira e sai em rota.',
    triggerEvent: 'Status alterado para "ready" (tipo = delivery)',
  },
  {
    key: 'ready_pickup',
    label: '4. Pronto para Retirada (Balcão)',
    badge: 'KDS: Pronto no Balcão',
    badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    icon: ShoppingBag,
    description: 'Enviada para clientes que escolheram retirar presencialmente na loja.',
    triggerEvent: 'Status alterado para "ready" (tipo = pickup)',
  },
  {
    key: 'delivered',
    label: '5. Pedido Entregue / Concluído',
    badge: 'KDS: Finalizado',
    badgeColor: 'bg-teal-100 text-teal-800 border-teal-200',
    icon: PackageCheck,
    description: 'Agradecimento ao cliente, solicitação de avaliação e encerramento.',
    triggerEvent: 'Status alterado para "delivered"',
  },
  {
    key: 'cancelled',
    label: '6. Pedido Cancelado',
    badge: 'KDS: Cancelado',
    badgeColor: 'bg-rose-100 text-rose-800 border-rose-200',
    icon: AlertTriangle,
    description: 'Aviso de cancelamento com instruções para estorno ou novo pedido.',
    triggerEvent: 'Status alterado para "cancelled"',
  },
];

const DEFAULT_TEMPLATES: Record<TemplateKey, string> = {
  confirmed: `✅ *Pedido #{numero_pedido} Confirmado!*\n\nOlá, *{cliente_primeiro_nome}*! Seu pedido foi confirmado com sucesso pela equipe do *{restaurante_nome}* e já entrou na nossa fila de produção! 👨‍🍳🔥\n\n📦 *Itens:* {itens_resumo}\n🛵 *Tipo:* {tipo_pedido}\n📍 *Destino:* {endereco_entrega}\n💰 *Total:* {total} ({forma_pagamento})\n⏱️ *Previsão de Entrega:* {previsao_minutos} min\n\n👉 *Acompanhe em tempo real pelo link:*\n{link_rastreamento}`,
  preparing: `🔥 *Pedido #{numero_pedido} no Fogo!*\n\n*{cliente_primeiro_nome}*, a chapa está quente! Nossos chefs já estão preparando seu pedido com todo carinho no *{restaurante_nome}*! 🍔🍕\n\n📦 *Itens em preparo:* {itens_resumo}\n⏱️ *Previsão para sair:* ~15 a 20 min\n\n👉 *Acompanhe seu pedido ao vivo:*\n{link_rastreamento}`,
  ready_delivery: `🛵 *Pedido #{numero_pedido} a Caminho!*\n\n*{cliente_primeiro_nome}*, seu pedido acabou de sair para entrega com o nosso motoboy! 💨\n\n📍 *Destino:* {endereco_entrega}\n⏱️ *Previsão de chegada:* 10 a 25 min\n\nPor favor, fique atento ao interfone ou portaria!\n👉 *Rastrear pedido no mapa:*\n{link_rastreamento}`,
  ready_pickup: `🛍️ *Pedido #{numero_pedido} Pronto para Retirada!*\n\n*{cliente_primeiro_nome}*, seu pedido está quentinho, embalado e pronto te esperando no balcão do *{restaurante_nome}*! ✨\n\n📍 *Endereço para retirada:* {restaurante_endereco}\n\nVenha retirar quando puder! Apresente o código #{numero_pedido}.`,
  delivered: `🎉 *Pedido #{numero_pedido} Entregue com Sucesso!*\n\nBom apetite, *{cliente_primeiro_nome}*! 😋\nAgradecemos imensamente a sua preferência no *{restaurante_nome}*!\n\nEsperamos que sua refeição esteja deliciosa. Se puder, nos conte o que achou respondendo esta mensagem! 💬`,
  cancelled: `⚠️ *Aviso: Pedido #{numero_pedido} Cancelado*\n\nOlá, *{cliente_primeiro_nome}*. Informamos que seu pedido #{numero_pedido} no *{restaurante_nome}* foi cancelado.\n\nSe você tiver qualquer dúvida ou quiser refazer seu pedido, basta responder diretamente a esta mensagem para falar com nossa equipe!`,
};

const VARIABLE_PILLS = [
  { tag: '{cliente_primeiro_nome}', label: 'Primeiro Nome', tooltip: 'Ex: Adriano' },
  { tag: '{cliente_nome}', label: 'Nome Completo', tooltip: 'Ex: Adriano Saraiva' },
  { tag: '{numero_pedido}', label: 'Nº Pedido', tooltip: 'Ex: 1042' },
  { tag: '{restaurante_nome}', label: 'Restaurante', tooltip: 'Ex: Brasas & Burger Artesanal' },
  { tag: '{tipo_pedido}', label: 'Tipo Entrega', tooltip: 'Ex: Entrega ou Retirada' },
  { tag: '{endereco_entrega}', label: 'Endereço', tooltip: 'Ex: Av. Consolação, 1420' },
  { tag: '{previsao_minutos}', label: 'Previsão (Min)', tooltip: 'Ex: 35' },
  { tag: '{total}', label: 'Total R$', tooltip: 'Ex: R$ 85,80' },
  { tag: '{itens_resumo}', label: 'Resumo Itens', tooltip: 'Ex: 1x Smash Bacon, 1x Costela' },
  { tag: '{forma_pagamento}', label: 'Forma Pagto', tooltip: 'Ex: Pix no Recebimento' },
  { tag: '{link_rastreamento}', label: 'Link Rastreamento', tooltip: 'https://.../pedido/:id' },
  { tag: '{restaurante_endereco}', label: 'Endereço Loja', tooltip: 'Ex: Av. Paulista, 1200' },
];

export const NotificationTemplatesEditor: React.FC<NotificationTemplatesEditorProps> = ({
  tenant,
  orders,
  onUpdateTenant,
  onNavigateToLogs,
}) => {
  const [selectedKey, setSelectedKey] = useState<TemplateKey>('confirmed');
  const [templates, setTemplates] = useState<Record<TemplateKey, string>>(() => {
    return {
      confirmed: tenant.statusNotificationTemplates?.confirmed || DEFAULT_TEMPLATES.confirmed,
      preparing: tenant.statusNotificationTemplates?.preparing || DEFAULT_TEMPLATES.preparing,
      ready_delivery: tenant.statusNotificationTemplates?.ready_delivery || DEFAULT_TEMPLATES.ready_delivery,
      ready_pickup: tenant.statusNotificationTemplates?.ready_pickup || DEFAULT_TEMPLATES.ready_pickup,
      delivered: tenant.statusNotificationTemplates?.delivered || DEFAULT_TEMPLATES.delivered,
      cancelled: tenant.statusNotificationTemplates?.cancelled || DEFAULT_TEMPLATES.cancelled,
    };
  });

  const [selectedOrderId, setSelectedOrderId] = useState<string>(() => {
    return orders[0]?.id || 'ord_1042';
  });

  const [testPhone, setTestPhone] = useState<string>(() => {
    const found = orders.find((o) => o.id === selectedOrderId);
    return found?.customerPhone || '559181214188';
  });

  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testSuccessMessage, setTestSuccessMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Selected sample order for interpolation
  const currentOrder = orders.find((o) => o.id === selectedOrderId) || orders[0] || {
    id: 'ord_1042',
    orderNumber: 1042,
    customerName: 'Adriano Saraiva',
    customerPhone: '559181214188',
    type: 'delivery',
    deliveryAddress: 'Av. Consolação, 1420, Apto 52 - Bela Vista',
    deliveryZoneName: 'Bela Vista / Consolação',
    estimatedMinutes: 35,
    items: [
      { productName: 'Smash Bacon Duplo Especial', quantity: 1, unitPriceCents: 3490, totalCents: 4090, selectedOptions: [] },
      { productName: 'Burger de Costela Desfiada', quantity: 1, unitPriceCents: 3890, totalCents: 3890, selectedOptions: [] }
    ],
    subtotalCents: 7980,
    deliveryFeeCents: 600,
    totalCents: 8580,
    paymentMethod: 'Pix no Recebimento',
    createdAt: '12:18'
  };

  // Interpolate tags for preview
  const interpolatedPreview = React.useMemo(() => {
    const raw = templates[selectedKey] || DEFAULT_TEMPLATES[selectedKey];
    const customerFirstName = (currentOrder.customerName || 'Cliente').trim().split(' ')[0];
    const orderNum = String(currentOrder.orderNumber || currentOrder.id || '1042');
    const totalFormatted = `R$ ${((currentOrder.totalCents || 0) / 100).toFixed(2).replace('.', ',')}`;
    const subtotalFormatted = `R$ ${((currentOrder.subtotalCents || 0) / 100).toFixed(2).replace('.', ',')}`;
    const deliveryFeeFormatted = `R$ ${((currentOrder.deliveryFeeCents || 0) / 100).toFixed(2).replace('.', ',')}`;
    const trackingUrl = `https://agencia-n8n.2eoc7n.easypanel.host/pedido/${currentOrder.id}`;
    const itemsSummary = (currentOrder.items || [])
      .map((i: any) => `${i.quantity}x ${i.productName}`)
      .join(', ') || 'Smash Bacon Duplo Especial';
    const orderType = currentOrder.type === 'delivery' ? 'Entrega' : 'Retirada no Balcão';
    const address = currentOrder.type === 'delivery'
      ? (currentOrder.deliveryAddress || 'Endereço informado')
      : `Retirada no Balcão (${tenant.address || 'Balcão da loja'})`;
    const estimatedMin = String(currentOrder.estimatedMinutes || 35);

    const vars: Record<string, string> = {
      cliente_nome: currentOrder.customerName || 'Cliente',
      cliente_primeiro_nome: customerFirstName,
      numero_pedido: orderNum,
      restaurante_nome: tenant.name || 'Restaurante',
      restaurante_endereco: tenant.address || 'Av. Paulista, 1200',
      restaurante_telefone: tenant.phone || '',
      tipo_pedido: orderType,
      endereco_entrega: address,
      bairro_entrega: (currentOrder as any).deliveryZoneName || 'Bela Vista',
      previsao_minutos: estimatedMin,
      total: totalFormatted,
      subtotal: subtotalFormatted,
      taxa_entrega: deliveryFeeFormatted,
      itens_resumo: itemsSummary,
      forma_pagamento: (currentOrder as any).paymentMethod || 'Pix no Recebimento',
      link_rastreamento: trackingUrl,
    };

    let result = raw;
    for (const [key, value] of Object.entries(vars)) {
      result = result.split(`{${key}}`).join(value);
    }
    return result;
  }, [templates, selectedKey, currentOrder, tenant]);

  // Insert variable at textarea cursor
  const handleInsertVariable = (tag: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentText = templates[selectedKey] || '';

    const newText = currentText.substring(0, start) + tag + currentText.substring(end);
    setTemplates((prev) => ({
      ...prev,
      [selectedKey]: newText,
    }));

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + tag.length, start + tag.length);
    }, 50);
  };

  // Restore current template to default
  const handleRestoreDefault = () => {
    setTemplates((prev) => ({
      ...prev,
      [selectedKey]: DEFAULT_TEMPLATES[selectedKey],
    }));
  };

  // Save templates to backend
  const handleSaveTemplates = async () => {
    setIsSaving(true);
    setSaveSuccessMessage(null);
    try {
      const res = await fetch(`/api/v1/tenants/${tenant.slug}/notification-templates`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templates }),
      });

      if (res.ok) {
        if (onUpdateTenant) {
          onUpdateTenant({
            ...tenant,
            statusNotificationTemplates: templates,
          });
        }
        setSaveSuccessMessage('Modelos de notificação salvos e ativados com sucesso no sistema!');
        setTimeout(() => setSaveSuccessMessage(null), 4000);
      }
    } catch (err) {
      console.error('Error saving templates:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Send real test notification via Evolution API
  const handleSendTestWhatsApp = async () => {
    setIsSendingTest(true);
    setTestSuccessMessage(null);

    try {
      const res = await fetch('/api/v1/notifications/test-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantSlug: tenant.slug,
          templateKey: selectedKey,
          customText: templates[selectedKey],
          customPhone: testPhone,
          orderId: currentOrder.id,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setTestSuccessMessage(
          `Mensagem disparada com sucesso para o WhatsApp ${data.targetPhone} via Evolution API (${data.instance})!`
        );
      }
    } catch (err) {
      console.error('Error sending test notification:', err);
    } finally {
      setIsSendingTest(false);
    }
  };

  const currentMeta = TEMPLATE_META.find((m) => m.key === selectedKey) || TEMPLATE_META[0];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 text-white rounded-2xl p-6 shadow-md border border-neutral-700">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-semibold mb-2 border border-emerald-500/30">
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
              <span>Evolution API v2 • Instância: {tenant.evolutionInstanceId || 'aladay'}</span>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-emerald-400" />
              Textos &amp; Notificações Automáticas no WhatsApp
            </h2>
            <p className="text-xs text-neutral-300 mt-1 max-w-2xl leading-relaxed">
              Personalize exatamente a mensagem que o cliente recebe no WhatsApp em cada etapa do pedido na cozinha (KDS).
              Insira variáveis dinâmicas com 1 clique e envie testes reais instantaneamente para o seu celular.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveTemplates}
              disabled={isSaving}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs shadow-sm flex items-center gap-2 transition-all disabled:opacity-50"
            >
              {isSaving ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              <span>Salvar Alterações</span>
            </button>

            {onNavigateToLogs && (
              <button
                onClick={onNavigateToLogs}
                className="px-3.5 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 font-medium rounded-xl text-xs flex items-center gap-1.5 transition-colors"
                title="Ver logs completos de webhook e API"
              >
                <Terminal className="w-3.5 h-3.5 text-neutral-400" />
                <span>Logs</span>
              </button>
            )}
          </div>
        </div>

        {saveSuccessMessage && (
          <div className="mt-4 p-3 bg-emerald-950/80 border border-emerald-700 text-emerald-200 rounded-xl text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{saveSuccessMessage}</span>
          </div>
        )}
      </div>

      {/* Status Selector Navigation */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {TEMPLATE_META.map((meta) => {
          const Icon = meta.icon;
          const isSelected = selectedKey === meta.key;
          return (
            <button
              key={meta.key}
              onClick={() => setSelectedKey(meta.key)}
              className={`px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 whitespace-nowrap transition-all border ${
                isSelected
                  ? 'bg-neutral-900 text-white border-neutral-900 shadow-xs'
                  : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50 hover:border-neutral-300'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-emerald-400' : 'text-neutral-500'}`} />
              <span>{meta.label}</span>
            </button>
          );
        })}
      </div>

      {/* Editor & Preview Split View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Editor (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white border border-neutral-200 rounded-2xl p-5 shadow-2xs space-y-4">
            {/* Meta Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-neutral-100">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-neutral-900 text-sm">{currentMeta.label}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${currentMeta.badgeColor}`}>
                    {currentMeta.badge}
                  </span>
                </div>
                <p className="text-xs text-neutral-500 mt-0.5">{currentMeta.description}</p>
              </div>

              <button
                type="button"
                onClick={handleRestoreDefault}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] text-neutral-600 hover:text-neutral-900 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors self-start sm:self-center font-medium"
                title="Restaurar o modelo padrão original recomendado"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Restaurar Padrão</span>
              </button>
            </div>

            {/* Variable Pills Toolbar */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold text-neutral-700 uppercase tracking-wider flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-emerald-600" />
                  Clique para Inserir Variável Dinâmica:
                </span>
                <span className="text-[10px] text-neutral-400">Substituído automaticamente pelos dados reais</span>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-2 bg-neutral-50 rounded-xl border border-neutral-200">
                {VARIABLE_PILLS.map((pill) => (
                  <button
                    key={pill.tag}
                    type="button"
                    onClick={() => handleInsertVariable(pill.tag)}
                    title={pill.tooltip}
                    className="px-2 py-1 bg-white hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-300 text-neutral-700 border border-neutral-200 rounded-md text-[11px] font-mono transition-colors shadow-2xs"
                  >
                    {pill.tag}
                  </button>
                ))}
              </div>
            </div>

            {/* Textarea */}
            <div>
              <label className="block text-xs font-bold text-neutral-800 mb-1">
                Texto do Template no WhatsApp:
              </label>
              <textarea
                ref={textareaRef}
                rows={11}
                value={templates[selectedKey] || ''}
                onChange={(e) =>
                  setTemplates((prev) => ({
                    ...prev,
                    [selectedKey]: e.target.value,
                  }))
                }
                className="w-full p-3.5 border border-neutral-300 rounded-xl text-xs font-mono leading-relaxed focus:outline-neutral-900 focus:ring-2 focus:ring-neutral-900/10 transition-all bg-neutral-900/2 text-neutral-900"
                placeholder="Escreva a mensagem aqui..."
              />
              <div className="flex items-center justify-between mt-1.5 text-[11px] text-neutral-400">
                <span>Dica: Use <code>*negrito*</code>, <code>_itálico_</code> e quebras de linha normais.</span>
                <span>{(templates[selectedKey] || '').length} caracteres</span>
              </div>
            </div>

            {/* Save Action */}
            <div className="pt-3 border-t border-neutral-100 flex items-center justify-between">
              <span className="text-[11px] text-neutral-500 flex items-center gap-1">
                <Info className="w-3.5 h-3.5 text-neutral-400" />
                Gatilho: {currentMeta.triggerEvent}
              </span>
              <button
                type="button"
                onClick={handleSaveTemplates}
                disabled={isSaving}
                className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>{isSaving ? 'Salvando...' : 'Salvar Texto deste Status'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: WhatsApp Smartphone Live Preview & Real Dispatch (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Dispatch Tester Card */}
          <div className="bg-white border border-neutral-200 rounded-2xl p-5 shadow-2xs space-y-3.5">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
              <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-wider flex items-center gap-1.5">
                <Send className="w-3.5 h-3.5 text-emerald-600" />
                Disparo de Teste no WhatsApp Real
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                Evolution API: aladay
              </span>
            </div>

            {/* Select sample order */}
            <div>
              <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                Pedido de Amostra para Simular:
              </label>
              <select
                value={selectedOrderId}
                onChange={(e) => {
                  setSelectedOrderId(e.target.value);
                  const found = orders.find((o) => o.id === e.target.value);
                  if (found) setTestPhone(found.customerPhone);
                }}
                className="w-full p-2 border border-neutral-300 rounded-lg text-xs bg-white text-neutral-900 focus:outline-neutral-900"
              >
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    #{o.orderNumber} - {o.customerName} ({o.type === 'delivery' ? 'Entrega' : 'Retirada'}) - R$ {(o.totalCents / 100).toFixed(2)}
                  </option>
                ))}
              </select>
            </div>

            {/* Test Phone Input */}
            <div>
              <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                WhatsApp de Destino do Teste:
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  placeholder="559181214188"
                  className="flex-1 p-2 border border-neutral-300 rounded-lg text-xs font-mono focus:outline-neutral-900"
                />
                <button
                  type="button"
                  onClick={() => setTestPhone('559181214188')}
                  className="px-2.5 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg text-[10px] font-semibold border border-neutral-200"
                  title="Usar número do Adriano do webhook"
                >
                  Padrão (Adriano)
                </button>
              </div>
              <p className="text-[10px] text-neutral-400 mt-1">
                Formato com DDI e DDD (ex: 559181214188). Envia diretamente via instância conectada.
              </p>
            </div>

            {/* Send Button */}
            <button
              type="button"
              onClick={handleSendTestWhatsApp}
              disabled={isSendingTest}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50"
            >
              {isSendingTest ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Enviando para o WhatsApp...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Disparar Notificação Real Agora</span>
                </>
              )}
            </button>

            {testSuccessMessage && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-start gap-2 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold">{testSuccessMessage}</p>
                  <p className="text-[10px] text-emerald-700 mt-1">
                    Confira o WhatsApp no aparelho {testPhone} ou visualize a requisição nos Logs de Webhook.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Smartphone Frame Live Preview */}
          <div className="bg-neutral-900 rounded-3xl p-3 shadow-lg border border-neutral-800">
            {/* Phone Screen */}
            <div className="bg-[#EFEAE2] rounded-2xl overflow-hidden shadow-inner flex flex-col h-[460px] border border-neutral-300">
              {/* WhatsApp Header */}
              <div className="bg-[#075E54] text-white p-3 flex items-center justify-between shrink-0 shadow-sm">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                    {tenant.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-xs font-bold leading-tight line-clamp-1">{tenant.name}</p>
                    <p className="text-[10px] text-emerald-200">comercial • online</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-white/80">
                  <Phone className="w-3.5 h-3.5" />
                  <Smartphone className="w-3.5 h-3.5" />
                </div>
              </div>

              {/* Chat Viewport */}
              <div className="flex-1 p-3 overflow-y-auto space-y-3 flex flex-col justify-end">
                <div className="text-center">
                  <span className="bg-white/80 backdrop-blur-xs text-[10px] text-neutral-500 px-2.5 py-0.5 rounded-full font-mono shadow-2xs">
                    Hoje • Mensagem do Sistema KDS
                  </span>
                </div>

                {/* WhatsApp Outbound Balloon */}
                <div className="bg-[#E7FFDB] border border-[#D0F1B8] rounded-xl rounded-tr-none p-3 shadow-2xs max-w-[92%] self-end space-y-1.5">
                  <p className="text-[11px] text-neutral-900 whitespace-pre-wrap leading-relaxed font-sans">
                    {interpolatedPreview}
                  </p>

                  <div className="flex items-center justify-end gap-1 text-[9px] text-neutral-500 pt-1">
                    <span>{new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                    <span className="text-blue-500 font-bold">✓✓</span>
                  </div>
                </div>
              </div>

              {/* Fake WhatsApp Input */}
              <div className="p-2 bg-[#F0F2F5] border-t border-neutral-200 flex items-center gap-2 shrink-0">
                <div className="flex-1 bg-white rounded-full px-3 py-1.5 text-[11px] text-neutral-400 border border-neutral-300">
                  Mensagem...
                </div>
                <div className="w-7 h-7 rounded-full bg-[#00A884] flex items-center justify-center text-white">
                  <Send className="w-3 h-3" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
