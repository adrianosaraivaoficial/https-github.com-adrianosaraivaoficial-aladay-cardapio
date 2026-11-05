import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Zap,
  ArrowRight,
  KeyRound,
  Store,
  Webhook,
  Bike,
  AlertCircle,
  Check,
  LayoutGrid,
  BarChart3,
} from 'lucide-react';
import { IfoodIntegrationConfig, Order, Product, RestaurantTenant, WebhookLogEvent } from '../types';

interface IfoodIntegrationViewProps {
  tenant: RestaurantTenant;
  orders: Order[];
  products: Product[];
  isSuperAdmin?: boolean;
  onUpdateTenant: (updated: RestaurantTenant) => void;
  onInjectOrder?: (order: Order) => void;
  onNavigateToTab?: (tab: 'kds' | 'reports' | 'menu') => void;
}

export const IfoodIntegrationView: React.FC<IfoodIntegrationViewProps> = ({
  tenant,
  orders,
  products,
  isSuperAdmin = false,
  onUpdateTenant,
  onInjectOrder,
  onNavigateToTab,
}) => {
  const defaultWebhookUrl = 'https://aladay.com.br/api/v1/ifood/webhook';

  const [enabled, setEnabled] = useState<boolean>(tenant.ifoodConfig?.enabled ?? false);
  const [merchantId, setMerchantId] = useState<string>(tenant.ifoodConfig?.merchantId || '');
  const [autoAcceptOrders, setAutoAcceptOrders] = useState<boolean>(
    tenant.ifoodConfig?.autoAcceptOrders ?? false
  );
  const [syncCatalogPrices, setSyncCatalogPrices] = useState<boolean>(
    tenant.ifoodConfig?.syncCatalogPrices ?? true
  );
  const [commissionPercent, setCommissionPercent] = useState<number>(
    tenant.ifoodConfig?.commissionPercent ?? 23
  );
  const [userCode, setUserCode] = useState<string>(tenant.ifoodConfig?.userCode || '');
  const [verificationUrl, setVerificationUrl] = useState<string>(
    tenant.ifoodConfig?.verificationUrlComplete || 'https://portal.ifood.com.br/apps/code'
  );
  const [webhookUrl, setWebhookUrl] = useState<string>(
    tenant.ifoodConfig?.webhookUrl || defaultWebhookUrl
  );
  const [recentLogs, setRecentLogs] = useState<WebhookLogEvent[]>([]);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [isSimulatingOrder, setIsSimulatingOrder] = useState(false);
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'info';
    message: string;
  } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    setEnabled(tenant.ifoodConfig?.enabled ?? false);
    setMerchantId(tenant.ifoodConfig?.merchantId || '');
    setAutoAcceptOrders(tenant.ifoodConfig?.autoAcceptOrders ?? false);
    setSyncCatalogPrices(tenant.ifoodConfig?.syncCatalogPrices ?? true);
    setCommissionPercent(tenant.ifoodConfig?.commissionPercent ?? 23);
    setUserCode(tenant.ifoodConfig?.userCode || '');
    setVerificationUrl(
      tenant.ifoodConfig?.verificationUrlComplete || 'https://portal.ifood.com.br/apps/code'
    );
  }, [tenant]);

  const fetchIfoodStatus = async () => {
    try {
      const res = await fetch(`/api/v1/ifood/status/${tenant.slug}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.webhookUrl) setWebhookUrl(data.webhookUrl);
      if (Array.isArray(data.recentLogs)) setRecentLogs(data.recentLogs);
    } catch {
      // Ignore network errors in offline preview
    }
  };

  useEffect(() => {
    fetchIfoodStatus();
  }, [tenant.slug]);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 2500);
  };

  const handleGenerateUserCode = async () => {
    setIsGeneratingCode(true);
    try {
      const res = await fetch('/api/v1/ifood/oauth/user-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantSlug: tenant.slug }),
      });
      const data = await res.json();
      if (data.userCode) {
        setUserCode(data.userCode);
        if (data.verificationUrlComplete) setVerificationUrl(data.verificationUrlComplete);
        const nextConfig: IfoodIntegrationConfig = {
          enabled,
          merchantId,
          status: 'pending_authorization',
          userCode: data.userCode,
          authorizationCodeVerifier: data.authorizationCodeVerifier,
          verificationUrlComplete: data.verificationUrlComplete,
          autoAcceptOrders,
          syncCatalogPrices,
          commissionPercent,
          webhookUrl,
        };
        onUpdateTenant({ ...tenant, ifoodConfig: nextConfig });
        setFeedbackBanner({
          type: 'info',
          message: `Código de vínculo ${data.userCode} gerado! Acesse o Portal do Parceiro iFood > Aplicativos > Ativar por código para autorizar.`,
        });
        fetchIfoodStatus();
      }
    } catch {
      const fallbackCode = `ALAD-${Math.floor(1000 + Math.random() * 9000)}`;
      setUserCode(fallbackCode);
      setFeedbackBanner({
        type: 'info',
        message: `Código de vínculo ${fallbackCode} gerado para homologação.`,
      });
    } finally {
      setIsGeneratingCode(false);
    }
  };

  const handleSaveIfoodConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingConfig(true);
    const cleanMerchant = merchantId.trim();
    const isNowConnected = Boolean(cleanMerchant && enabled);

    const nextConfig: IfoodIntegrationConfig = {
      enabled,
      merchantId: cleanMerchant,
      status: isNowConnected ? 'connected' : 'disconnected',
      userCode,
      verificationUrlComplete: verificationUrl,
      autoAcceptOrders,
      syncCatalogPrices,
      commissionPercent: Number(commissionPercent) || 23,
      lastPollingAt: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      webhookUrl,
    };

    try {
      await fetch(`/api/v1/ifood/config/${tenant.slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextConfig),
      });
    } catch {
      // Local state still updates cleanly
    }

    onUpdateTenant({
      ...tenant,
      ifoodConfig: nextConfig,
    });

    setIsSavingConfig(false);
    setFeedbackBanner({
      type: 'success',
      message: isNowConnected
        ? `Integração iFood ativada com sucesso para ${tenant.name} (Merchant ID: ${cleanMerchant})!`
        : `Configurações iFood de ${tenant.name} salvas.`,
    });
    fetchIfoodStatus();
    setTimeout(() => setFeedbackBanner(null), 5000);
  };

  const handleSimulateIfoodOrder = async () => {
    setIsSimulatingOrder(true);
    try {
      const sampleItems =
        products.length >= 2
          ? [
              {
                productId: products[0].id,
                productName: products[0].name,
                unitPriceCents: products[0].priceCents,
                quantity: 1,
                selectedOptions: [],
                notes: 'Pedido via App iFood · Enviar sachês extras',
                totalCents: products[0].priceCents,
              },
              {
                productId: products[1].id,
                productName: products[1].name,
                unitPriceCents: products[1].priceCents,
                quantity: 2,
                selectedOptions: [],
                totalCents: products[1].priceCents * 2,
              },
            ]
          : undefined;

      const res = await fetch('/api/v1/ifood/simulate-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantSlug: tenant.slug,
          merchantId: merchantId || `merch_${tenant.slug}`,
          items: sampleItems,
        }),
      });
      const data = await res.json();
      if (data.order && onInjectOrder) {
        onInjectOrder(data.order);
        setFeedbackBanner({
          type: 'success',
          message: `🔴 Novo Pedido iFood #${data.order.ifoodDisplayId || data.order.orderNumber} (Coleta: ${data.order.ifoodPickupCode}) recebido e enviado direto para o KDS de ${tenant.name}!`,
        });
        fetchIfoodStatus();
      }
    } catch {
      // Fallback local order injection if offline
      if (onInjectOrder) {
        const displayId = String(Math.floor(4100 + Math.random() * 5800));
        const pickupCode = String(Math.floor(1000 + Math.random() * 8999));
        const nowStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const fallbackOrder: Order = {
          id: `ord_ifood_${Date.now()}`,
          orderNumber: Number(displayId),
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          customerName: 'Mariana Costa (via iFood)',
          customerPhone: '5511994128831',
          type: 'delivery',
          deliveryAddress: 'Rua dos Pinheiros, 840 - Apto 62',
          deliveryZoneName: 'Entrega iFood',
          estimatedMinutes: 35,
          items: [
            {
              productId: products[0]?.id || 'if_1',
              productName: products[0]?.name || 'Combo Smash Duplo + Fritas',
              unitPriceCents: products[0]?.priceCents || 4890,
              quantity: 1,
              selectedOptions: [],
              totalCents: products[0]?.priceCents || 4890,
            },
          ],
          subtotalCents: products[0]?.priceCents || 4890,
          deliveryFeeCents: 990,
          totalCents: (products[0]?.priceCents || 4890) + 990,
          status: autoAcceptOrders ? 'confirmed' : 'received',
          paymentStatus: 'paid_online',
          paymentMethod: 'Pago Online via iFood (App)',
          whatsAppStatus: 'sent',
          channel: 'IFOOD',
          ifoodOrderId: `ifood_${Date.now()}`,
          ifoodDisplayId: displayId,
          ifoodPickupCode: pickupCode,
          whatsAppLogs: [
            {
              timestamp: nowStr,
              event: 'IFOOD_PLACED',
              detail: `Pedido iFood #${displayId} recebido via Webhook Oficial (Coleta: ${pickupCode})`,
            },
          ],
          createdAt: nowStr,
          updatedAt: nowStr,
        };
        onInjectOrder(fallbackOrder);
        setFeedbackBanner({
          type: 'success',
          message: `🔴 Pedido iFood #${displayId} (Coleta: ${pickupCode}) injetado no KDS!`,
        });
      }
    } finally {
      setIsSimulatingOrder(false);
    }
  };

  const ifoodOrders = orders.filter((o) => o.channel === 'IFOOD');
  const directOrders = orders.filter((o) => o.channel !== 'IFOOD');
  const ifoodRevenueCents = ifoodOrders
    .filter((o) => o.status !== 'cancelled')
    .reduce((sum, o) => sum + o.totalCents, 0);
  const directRevenueCents = directOrders
    .filter((o) => o.status !== 'cancelled')
    .reduce((sum, o) => sum + o.totalCents, 0);
  const savedCommissionCents = Math.round(directRevenueCents * ((commissionPercent || 23) / 100));

  const formatBRL = (cents: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);

  const isConnected = Boolean(enabled && merchantId.trim());

  return (
    <div className="space-y-6">
      {/* Top Hero Banner */}
      <div className="bg-gradient-to-r from-rose-950 via-red-900 to-slate-900 text-white rounded-xl p-5 sm:p-6 border border-rose-800/60 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1.5 max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-red-600 text-white border border-red-400/40">
              🔴 Integração Oficial iFood Partner API
            </span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                isConnected
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                  : 'bg-amber-500/20 text-amber-200 border-amber-400/40'
              }`}
            >
              {isConnected ? '● Loja Conectada ao iFood' : '○ Aguardando Vínculo Merchant ID'}
            </span>
          </div>
          <h2 className="text-base sm:text-lg font-bold text-white">
            Hub Unificado: Receba Pedidos do iFood e do Cardápio Próprio no Mesmo KDS
          </h2>
          <p className="text-xs text-rose-100/90 leading-relaxed">
            Centralize a operação de <strong>{tenant.name}</strong> sem precisar abrir o Gestor de Pedidos do iFood em outra tela. Quando você confirma ou despacha no nosso KDS, o status é atualizado automaticamente no aplicativo do iFood.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleSimulateIfoodOrder}
            disabled={isSimulatingOrder}
            className="px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-sm transition-colors cursor-pointer disabled:opacity-50"
          >
            {isSimulatingOrder ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Zap className="w-4 h-4 fill-current" />
            )}
            <span>Simular Pedido iFood no KDS</span>
          </button>

          {onNavigateToTab && (
            <button
              type="button"
              onClick={() => onNavigateToTab('kds')}
              className="px-3.5 py-2.5 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl text-xs flex items-center gap-1.5 border border-white/15 transition-colors cursor-pointer"
            >
              <LayoutGrid className="w-4 h-4" />
              <span>Abrir KDS ({ifoodOrders.length} iFood)</span>
            </button>
          )}
        </div>
      </div>

      {feedbackBanner && (
        <div
          className={`p-4 rounded-xl border text-xs font-semibold flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            feedbackBanner.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-blue-50 border-blue-200 text-blue-900'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{feedbackBanner.message}</span>
          </div>
          {onNavigateToTab && (
            <button
              type="button"
              onClick={() => onNavigateToTab('kds')}
              className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg text-[11px] font-bold flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <span>Ver Pedido no KDS</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Comparative Channel Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-semibold">Pedidos via iFood (Hoje/Sessão)</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">
              Canal iFood
            </span>
          </div>
          <p className="text-2xl font-bold font-mono text-slate-900 mt-1.5">
            {formatBRL(ifoodRevenueCents)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            {ifoodOrders.length} pedido(s) recebidos no KDS · Taxa estimada ({commissionPercent}%):{' '}
            <strong className="text-rose-600">
              -{formatBRL(Math.round(ifoodRevenueCents * (commissionPercent / 100)))}
            </strong>
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-semibold">Pedidos no Cardápio Próprio</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              0% Comissão
            </span>
          </div>
          <p className="text-2xl font-bold font-mono text-emerald-700 mt-1.5">
            {formatBRL(directRevenueCents)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            {directOrders.length} pedido(s) diretos · <strong>100% líquido via Pix na conta</strong>
          </p>
        </div>

        <div className="bg-emerald-950 text-white border border-emerald-800 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-emerald-300">
            <span className="font-semibold">Economia Gerada pelo Cardápio Próprio</span>
            <Sparkles className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold font-mono text-white mt-1.5">
            +{formatBRL(savedCommissionCents)}
          </p>
          <p className="text-[11px] text-emerald-200/90 mt-1">
            Comissão economizada em relação à taxa de {commissionPercent}% do iFood.
          </p>
        </div>
      </div>

      {/* Main Configuration Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 7 Cols: Step 1 (OAuth UserCode) + Step 2 (Merchant ID & Preferences) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Step 1: OAuth UserCode Authorization */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-2xs">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-200">
                  Passo 1 · Autorização OAuth2 Centralizada
                </span>
                <h3 className="text-sm font-bold text-slate-900 mt-1.5 flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-red-600" />
                  <span>Gerar Código de Vínculo para o Portal do Parceiro iFood</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Gere o código abaixo e cole em <strong>Portal do Parceiro iFood &rarr; Aplicativos &rarr; Ativar aplicativo por código</strong>.
                </p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Código de Ativação (User Code)
                </span>
                {userCode ? (
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xl font-mono font-extrabold tracking-widest text-slate-900 bg-white px-3 py-1 rounded-lg border border-slate-300">
                      {userCode}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(userCode, 'userCode')}
                      className="p-2 text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg text-xs flex items-center gap-1 cursor-pointer"
                    >
                      {copiedField === 'userCode' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-700 font-semibold">Copiado</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copiar</span>
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 mt-1">
                    Clique em &quot;Gerar Código de Vínculo&quot; para iniciar a conexão com a loja.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleGenerateUserCode}
                  disabled={isGeneratingCode}
                  className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isGeneratingCode ? 'animate-spin' : ''}`} />
                  <span>{userCode ? 'Gerar Novo Código' : 'Gerar Código de Vínculo'}</span>
                </button>

                <a
                  href={verificationUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
                >
                  <span>Abrir Portal iFood</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          </div>

          {/* Step 2: Merchant ID & Operational Rules */}
          <form
            onSubmit={handleSaveIfoodConfig}
            className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-2xs"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-200">
                  Passo 2 · Identificação da Loja &amp; Automação KDS
                </span>
                <h3 className="text-sm font-bold text-slate-900 mt-1.5 flex items-center gap-2">
                  <Store className="w-4 h-4 text-red-600" />
                  <span>Configuração do Merchant ID iFood ({tenant.name})</span>
                </h3>
              </div>

              <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="w-4 h-4 accent-red-600 rounded"
                />
                <span>Integração Ativa</span>
              </label>
            </div>

            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    iFood Merchant ID (UUID da Loja no iFood)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setMerchantId(`9f4c2a10-8b3e-4d12-9a55-${tenant.slug.slice(0, 6).padEnd(6, '0')}123456`);
                      setEnabled(true);
                    }}
                    className="text-[11px] font-semibold text-red-600 hover:underline cursor-pointer"
                  >
                    Preencher UUID de Homologação
                  </button>
                </div>
                <input
                  type="text"
                  value={merchantId}
                  onChange={(e) => setMerchantId(e.target.value)}
                  placeholder="Ex: 59c3b8f0-12a4-4e89-9b11-08a72f190012"
                  className="w-full p-2.5 text-xs border border-slate-300 rounded-lg font-mono text-slate-900 focus:border-red-600 outline-none"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  O Webhook usa este UUID para direcionar automaticamente cada pedido do iFood para a fila KDS de <strong>{tenant.name}</strong>.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <label className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-start gap-2.5 cursor-pointer hover:border-slate-300">
                  <input
                    type="checkbox"
                    checked={autoAcceptOrders}
                    onChange={(e) => setAutoAcceptOrders(e.target.checked)}
                    className="w-4 h-4 mt-0.5 accent-red-600 rounded"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-slate-900 block">
                      Aceite Automático no KDS (/confirm)
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Confirma automaticamente os pedidos assim que chegam do iFood e já move para &quot;Em Preparo&quot;.
                    </span>
                  </div>
                </label>

                <label className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-start gap-2.5 cursor-pointer hover:border-slate-300">
                  <input
                    type="checkbox"
                    checked={syncCatalogPrices}
                    onChange={(e) => setSyncCatalogPrices(e.target.checked)}
                    className="w-4 h-4 mt-0.5 accent-red-600 rounded"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-slate-900 block">
                      Sincronizar Pausas de Produtos
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Ao pausar um item no cardápio Aladay, pausa também no catálogo iFood (`Catalog API v2`).
                    </span>
                  </div>
                </label>
              </div>

              <div className="pt-1">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Comissão Média do Plano iFood da Loja (%) — Para Cálculo de Economia nos Relatórios
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={1}
                    max={40}
                    value={commissionPercent}
                    onChange={(e) => setCommissionPercent(Number(e.target.value) || 23)}
                    className="w-28 p-2 text-xs border border-slate-300 rounded-lg font-mono font-bold text-slate-900"
                  />
                  <span className="text-[11px] text-slate-500">
                    Padrão iFood: <strong>12%</strong> (Plano Básico / Entrega Própria) ou <strong>23% a 27%</strong> (Plano Entrega Parceira).
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
              <span className="text-[11px] text-slate-500">
                Status atual:{' '}
                <strong className={isConnected ? 'text-emerald-700' : 'text-amber-700'}>
                  {isConnected ? 'Conectado e escutando eventos' : 'Aguardando ativação'}
                </strong>
              </span>

              <button
                type="submit"
                disabled={isSavingConfig}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                {isSavingConfig ? 'Salvando...' : 'Salvar Configuração iFood'}
              </button>
            </div>
          </form>
        </div>

        {/* Right 5 Cols: Webhook Endpoint, Bidirectional Mapping & Live Event Log */}
        <div className="lg:col-span-5 space-y-6">
          {/* Webhook Endpoint Box */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 shadow-2xs">
            <div className="flex items-center gap-2">
              <Webhook className="w-4 h-4 text-red-600" />
              <h3 className="text-sm font-bold text-slate-900">
                Endpoint de Webhook Oficial (iFood Developer)
              </h3>
            </div>
            <p className="text-xs text-slate-500">
              Configure esta URL na aba <strong>Webhook</strong> do seu aplicativo no portal <code>developer.ifood.com.br</code> para receber eventos <code>PLACED</code>, <code>CANCELLED</code> e <code>CONCLUDED</code> em tempo real:
            </p>

            <div className="p-2.5 bg-slate-900 text-slate-100 rounded-lg font-mono text-[11px] flex items-center justify-between gap-2">
              <span className="truncate">{webhookUrl}</span>
              <button
                type="button"
                onClick={() => handleCopy(webhookUrl, 'webhook')}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded text-[10px] font-sans font-semibold shrink-0 flex items-center gap-1 cursor-pointer"
              >
                {copiedField === 'webhook' ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span>Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Copiar URL</span>
                  </>
                )}
              </button>
            </div>

            <div className="pt-2 border-t border-slate-100 space-y-1.5 text-[11px] text-slate-600">
              <p className="font-bold text-slate-800">Mapeamento Bidirecional Automático (KDS &rarr; iFood):</p>
              <div className="flex justify-between">
                <span>1. Confirmar Pedido no KDS:</span>
                <code className="font-mono text-emerald-700 font-semibold">POST /orders/&#123;id&#125;/confirm</code>
              </div>
              <div className="flex justify-between">
                <span>2. Pronto / Despachar (Entrega):</span>
                <code className="font-mono text-blue-700 font-semibold">POST /orders/&#123;id&#125;/dispatch</code>
              </div>
              <div className="flex justify-between">
                <span>3. Pronto (Retirada Balcão):</span>
                <code className="font-mono text-purple-700 font-semibold">POST /orders/&#123;id&#125;/readyToPickup</code>
              </div>
              <div className="flex justify-between">
                <span>4. Recusar Pedido:</span>
                <code className="font-mono text-rose-700 font-semibold">POST /orders/&#123;id&#125;/requestCancellation</code>
              </div>
            </div>

            {isSuperAdmin && (
              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-[11px] text-indigo-900 space-y-1">
                <p className="font-bold flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Credenciais Globais da Plataforma (Easypanel .env)</span>
                </p>
                <p className="text-indigo-800">
                  Para produção com API real iFood, adicione <code>IFOOD_CLIENT_ID</code> e <code>IFOOD_CLIENT_SECRET</code> nas variáveis de ambiente do Easypanel.
                </p>
              </div>
            )}
          </div>

          {/* Recent iFood Webhook & Sync Logs */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 shadow-2xs">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Bike className="w-4 h-4 text-red-600" />
                <span>Últimos Eventos iFood &amp; KDS</span>
              </h3>
              <button
                type="button"
                onClick={fetchIfoodStatus}
                className="text-[11px] text-slate-500 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Atualizar</span>
              </button>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {recentLogs.length > 0 ? (
                recentLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-800">
                        {log.eventType}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">{log.timestamp}</span>
                    </div>
                    <p className="text-[11px] text-slate-700 font-medium">{log.payloadSummary}</p>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-xs text-slate-400">
                  <AlertCircle className="w-6 h-6 mx-auto mb-1.5 text-slate-300" />
                  <p>Nenhum evento iFood registrado nesta sessão.</p>
                  <p className="text-[11px] mt-0.5">
                    Clique em <strong>&quot;Simular Pedido iFood no KDS&quot;</strong> no topo para testar o fluxo completo.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
