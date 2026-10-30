import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  QrCode,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Download,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Zap,
  Info,
  Calendar,
  Lock,
  FileText,
  Sliders,
  DollarSign
} from 'lucide-react';
import { RestaurantTenant, AsaasSubscriptionData, AsaasInvoice, AsaasBillingType } from '../types';

interface AsaasSubscriptionBillingViewProps {
  tenant: RestaurantTenant;
  onUpdateTenant: (updatedTenant: RestaurantTenant) => void;
}

export const AsaasSubscriptionBillingView: React.FC<AsaasSubscriptionBillingViewProps> = ({
  tenant,
  onUpdateTenant,
}) => {
  const [subscription, setSubscription] = useState<AsaasSubscriptionData | null>(null);
  const [gatewayConfig, setGatewayConfig] = useState<{
    environment: 'sandbox' | 'production';
    apiUrl: string;
    webhookUrl: string;
    apiKeyMasked: string;
    webhookTokenMasked: string;
    configured: boolean;
  }>({
    environment: 'sandbox',
    apiUrl: 'https://sandbox.asaas.com/v3',
    webhookUrl: 'https://aladay.com.br/api/v1/asaas/webhook',
    apiKeyMasked: '',
    webhookTokenMasked: '',
    configured: true,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [selectedBillingType, setSelectedBillingType] = useState<AsaasBillingType>('PIX');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [feedbackNotice, setFeedbackNotice] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Credit Card Form State
  const [ccNumber, setCcNumber] = useState('');
  const [ccHolder, setCcHolder] = useState('');
  const [ccExpiry, setCcExpiry] = useState('');
  const [ccCvv, setCcCvv] = useState('');
  const [isSubmittingCard, setIsSubmittingCard] = useState(false);

  // Gateway Config modal / expander
  const [showConfigSettings, setShowConfigSettings] = useState(false);
  const [configEnv, setConfigEnv] = useState<'sandbox' | 'production'>('sandbox');
  const [configApiKey, setConfigApiKey] = useState('');
  const [configWebhookToken, setConfigWebhookToken] = useState('');

  // Fetch subscription data
  const fetchSubscription = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/v1/asaas/subscription/${tenant.slug}`);
      if (res.ok) {
        const data = await res.json();
        if (data.subscription) {
          setSubscription(data.subscription);
          setSelectedBillingType('PIX');
        }
        if (data.gateway) {
          setGatewayConfig(data.gateway);
          setConfigEnv(data.gateway.environment);
        }
      }
    } catch (err) {
      console.error('Erro ao carregar dados da assinatura Asaas:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscription();
  }, [tenant.slug]);

  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    setFeedbackNotice({ type, message });
    setTimeout(() => {
      setFeedbackNotice(null);
    }, 5000);
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(label);
    showToast('success', `${label} copiado para a área de transferência!`);
    setTimeout(() => setCopiedCode(null), 3000);
  };

  // Somente Pix está habilitado no backend neste momento.
  const handleChangeBillingType = (type: AsaasBillingType) => {
    if (type !== 'PIX') {
      showToast('info', 'Cartão e boleto estarão disponíveis após a implementação e validação do fluxo seguro.');
      return;
    }
    setSelectedBillingType('PIX');
  };

  // Submit Credit Card
  const handleSaveCreditCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ccNumber || !ccHolder || !ccExpiry || !ccCvv) {
      showToast('error', 'Preencha todos os campos do cartão de crédito.');
      return;
    }

    setIsSubmittingCard(true);
    try {
      const res = await fetch(`/api/v1/asaas/subscription/${tenant.slug}/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billingType: 'CREDIT_CARD',
          creditCardNumber: ccNumber,
          creditCardHolder: ccHolder,
          creditCardExpiry: ccExpiry,
          creditCardCcv: ccCvv,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSubscription(data.subscription);
        showToast('success', 'Cartão cadastrado com sucesso! Mensalidade de R$ 129,90 liquidada via Asaas.');
        setCcNumber('');
        setCcHolder('');
        setCcExpiry('');
        setCcCvv('');
        if (tenant.evolutionStatus !== 'connected') {
          onUpdateTenant({ ...tenant });
        }
      } else {
        showToast('error', 'Não foi possível autorizar o cartão no Asaas.');
      }
    } catch {
      showToast('error', 'Erro ao processar transação de cartão.');
    } finally {
      setIsSubmittingCard(false);
    }
  };

  // Save Gateway Credentials
  const handleSaveGatewayConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/v1/asaas/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          environment: configEnv,
          apiKey: configApiKey || undefined,
          webhookToken: configWebhookToken || undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setGatewayConfig(data.config);
        setShowConfigSettings(false);
        showToast('success', 'Configurações de credenciais Asaas salvas com sucesso!');
      }
    } catch {
      showToast('error', 'Erro ao salvar credenciais Asaas.');
    }
  };

  // Cancel / Reactivate Subscription
  const handleToggleSubscriptionStatus = async () => {
    const isCancelled = subscription?.status === 'CANCELLED';
    const endpoint = isCancelled ? 'reactivate' : 'cancel';
    try {
      const res = await fetch(`/api/v1/asaas/subscription/${tenant.slug}/${endpoint}`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        setSubscription(data.subscription);
        showToast(
          'info',
          isCancelled ? 'Assinatura reativada com sucesso no Asaas!' : 'Assinatura cancelada no gateway Asaas.'
        );
      }
    } catch {
      showToast('error', 'Erro ao alterar estado da assinatura.');
    }
  };

  const pendingInvoice = subscription?.invoices?.find((i) => i.status === 'PENDING') || subscription?.invoices?.[0];

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Toast Feedback */}
      {feedbackNotice && (
        <div
          className={`p-3.5 rounded-lg border flex items-center justify-between text-xs font-medium transition-all ${
            feedbackNotice.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : feedbackNotice.type === 'error'
              ? 'bg-red-50 text-red-900 border-red-200'
              : 'bg-blue-50 text-blue-900 border-blue-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackNotice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            ) : feedbackNotice.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
            ) : (
              <Info className="w-4 h-4 text-blue-600 flex-shrink-0" />
            )}
            <span>{feedbackNotice.message}</span>
          </div>
          <button
            onClick={() => setFeedbackNotice(null)}
            className="text-neutral-400 hover:text-neutral-700 ml-3"
          >
            &times;
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-neutral-900 text-white rounded-xl p-5 shadow-sm border border-neutral-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                Gateway Asaas Recorrente v3
              </span>
              <span className="text-xs text-neutral-400 font-mono">
                {gatewayConfig.environment === 'production' ? 'Produção Oficial' : 'Ambiente Sandbox Ativo'}
              </span>
            </div>
            <h2 className="text-lg font-bold tracking-tight">
              Assinatura Recorrente Aladay &bull; R$ 129,90 / mês
            </h2>
            <p className="text-xs text-neutral-300 max-w-2xl leading-relaxed">
              O gateway <strong>Asaas</strong> processa exclusivamente a mensalidade de R$ 129,90 da sua plataforma. Os pedidos e cobranças Pix dos seus clientes finais entram <strong>100% diretos na sua conta bancária</strong> com taxa 0%.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start md:self-center">
            <button
              onClick={() => setShowConfigSettings(!showConfigSettings)}
              className="px-3 py-2 text-xs font-medium text-neutral-300 bg-neutral-800 hover:bg-neutral-700 rounded-lg border border-neutral-700 transition-colors flex items-center gap-1.5"
            >
              <Sliders className="w-3.5 h-3.5 text-neutral-400" />
              <span>Configurar Asaas API</span>
            </button>
            <button
              onClick={fetchSubscription}
              disabled={isLoading}
              className="px-3 py-2 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-600 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Sincronizar</span>
            </button>
          </div>
        </div>
      </div>

      {/* Asaas API Configuration Drawer (When toggled) */}
      {showConfigSettings && (
        <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-neutral-900">
                Credenciais da API Asaas (SaaS Recorrente)
              </h3>
              <p className="text-xs text-neutral-500">
                Configure sua Chave de API do Asaas e endpoints de webhook para automação de baixa.
              </p>
            </div>
            <button
              onClick={() => setShowConfigSettings(false)}
              className="text-xs text-neutral-400 hover:text-neutral-700"
            >
              Fechar
            </button>
          </div>

          <form onSubmit={handleSaveGatewayConfig} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Ambiente Asaas
                </label>
                <select
                  value={configEnv}
                  onChange={(e) => setConfigEnv(e.target.value as 'sandbox' | 'production')}
                  className="w-full p-2.5 text-xs border border-neutral-200 rounded-lg text-neutral-900 bg-white"
                >
                  <option value="sandbox">Sandbox / Homologação (sandbox.asaas.com)</option>
                  <option value="production">Produção Oficial (api.asaas.com)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Chave de API do Asaas (API Key)
                </label>
                <input
                  type="password"
                  placeholder={gatewayConfig.apiKeyMasked || '$aact_YTU5YTE0M2M...'}
                  value={configApiKey}
                  onChange={(e) => setConfigApiKey(e.target.value)}
                  className="w-full p-2.5 text-xs font-mono border border-neutral-200 rounded-lg text-neutral-900"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-neutral-700">
                URL de Webhook para Cadastrar no Painel Asaas:
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={gatewayConfig.webhookUrl}
                  className="flex-1 p-2 bg-neutral-50 border border-neutral-200 rounded-lg text-xs font-mono text-emerald-800"
                />
                <button
                  type="button"
                  onClick={() => handleCopy(gatewayConfig.webhookUrl, 'URL de Webhook Asaas')}
                  className="px-3.5 py-2 text-xs font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 border border-neutral-200 rounded-lg flex items-center gap-1.5 whitespace-nowrap"
                >
                  {copiedCode === 'URL de Webhook Asaas' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>Copiar URL</span>
                </button>
              </div>
              <p className="text-[11px] text-neutral-500">
                No Asaas, acesse <strong>Menu &gt; Integrações &gt; Webhooks &gt; Nova Fila</strong> e selecione os eventos: <code>PAYMENT_RECEIVED</code>, <code>PAYMENT_CONFIRMED</code>, <code>PAYMENT_OVERDUE</code>.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => setShowConfigSettings(false)}
                className="px-4 py-2 text-xs font-semibold text-neutral-700 bg-white border border-neutral-200 rounded-lg hover:bg-neutral-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg"
              >
                Salvar Configurações
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 15-Day Free Trial Active Banner */}
      {(subscription?.status === 'TRIAL' || subscription?.isTrial || tenant.subscriptionStatus === 'trial') && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-extrabold uppercase tracking-wider">
                Período de Teste Grátis (15 Dias)
              </span>
              <span className="text-xs font-mono font-bold text-emerald-800">
                R$ 0,00 cobrados no teste
              </span>
            </div>
            <p className="text-xs text-neutral-700">
              Seu restaurante está operando no período de avaliação gratuita de 15 dias com todos os recursos liberados. A 1ª mensalidade de <strong>R$ 129,90</strong> está programada apenas para{' '}
              <strong>
                {subscription?.nextDueDate
                  ? new Date(subscription.nextDueDate + 'T12:00:00Z').toLocaleDateString('pt-BR')
                  : new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR')}
              </strong>.
            </p>
          </div>
          <div className="shrink-0 text-right">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-emerald-300 text-emerald-800 text-xs font-bold font-mono">
              <Clock className="w-3.5 h-3.5 text-emerald-600" />
              <span>15 dias grátis ativos</span>
            </span>
          </div>
        </div>
      )}

      {/* Plan Status Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-neutral-200 rounded-xl p-4 space-y-1 shadow-sm">
          <p className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">
            Status da Assinatura
          </p>
          <div className="flex items-center gap-2">
            {subscription?.status === 'ACTIVE' ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Ativa &bull; Em Dia</span>
              </span>
            ) : subscription?.status === 'TRIAL' || subscription?.isTrial || tenant.subscriptionStatus === 'trial' ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300">
                <Clock className="w-3.5 h-3.5 text-emerald-600" />
                <span>Teste Grátis &bull; 15 Dias</span>
              </span>
            ) : subscription?.status === 'OVERDUE' ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Em Atraso</span>
              </span>
            ) : subscription?.status === 'CANCELLED' ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-neutral-100 text-neutral-700 border border-neutral-200">
                <span>Cancelada</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                <Clock className="w-3.5 h-3.5" />
                <span>Pendente</span>
              </span>
            )}
          </div>
          <p className="text-[11px] text-neutral-500 font-mono mt-1">
            ID Asaas: {subscription?.id || 'sub_asaas_brasas_01'}
          </p>
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-4 space-y-1 shadow-sm">
          <p className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">
            Valor Mensal Recorrente
          </p>
          <p className="text-xl font-bold font-mono text-neutral-900">
            R$ 129,90 <span className="text-xs font-normal text-neutral-500">/ mês</span>
          </p>
          <p className="text-[11px] text-emerald-700 font-medium">
            Cobrança mensal no gateway Asaas
          </p>
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-4 space-y-1 shadow-sm">
          <p className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">
            Próximo Vencimento
          </p>
          <p className="text-xl font-bold font-mono text-neutral-900">
            {subscription?.nextDueDate
              ? new Date(subscription.nextDueDate + 'T12:00:00Z').toLocaleDateString('pt-BR')
              : '20/11/2026'}
          </p>
          <p className="text-[11px] text-neutral-500">
            Ciclo Mensal Automático
          </p>
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-4 space-y-1 shadow-sm">
          <p className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">
            Forma de Pagamento Atual
          </p>
          <div className="flex items-center gap-1.5 text-sm font-semibold text-neutral-900">
            {selectedBillingType === 'PIX' ? (
              <>
                <QrCode className="w-4 h-4 text-emerald-600" />
                <span>Pix Recorrente</span>
              </>
            ) : selectedBillingType === 'CREDIT_CARD' ? (
              <>
                <CreditCard className="w-4 h-4 text-blue-600" />
                <span>Cartão de Crédito</span>
              </>
            ) : (
              <>
                <FileText className="w-4 h-4 text-amber-600" />
                <span>Boleto Bancário</span>
              </>
            )}
          </div>
          <p className="text-[11px] text-neutral-500">
            Processado via Asaas Gateway
          </p>
        </div>
      </div>

      {/* Main Payment & Active Invoice Management Card */}
      <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-sm space-y-6">
        <div>
          <h3 className="text-sm font-bold text-neutral-900">
            Método de Pagamento da Assinatura Mensal (R$ 129,90)
          </h3>
          <p className="text-xs text-neutral-500">
            Escolha como prefere pagar a mensalidade da plataforma Aladay. Alterne a qualquer momento sem custos.
          </p>
        </div>

        {/* Method Selector Tabs */}
        <div className="grid grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => handleChangeBillingType('PIX')}
            className={`p-3.5 rounded-xl border text-left transition-all flex flex-col gap-1.5 ${
              selectedBillingType === 'PIX'
                ? 'border-emerald-600 bg-emerald-50/50 text-neutral-900 ring-2 ring-emerald-600/20'
                : 'border-neutral-200 hover:border-neutral-300 text-neutral-600 bg-white'
            }`}
          >
            <div className="flex items-center justify-between">
              <QrCode className={`w-5 h-5 ${selectedBillingType === 'PIX' ? 'text-emerald-700' : 'text-neutral-500'}`} />
              {selectedBillingType === 'PIX' && (
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                  Ativo
                </span>
              )}
            </div>
            <p className="text-xs font-bold text-neutral-900">Pix Recorrente Asaas</p>
            <p className="text-[11px] text-neutral-500 leading-tight">
              Liberação em segundos via QR Code e Copia e Cola.
            </p>
          </button>

          <button type="button" disabled className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50 text-left flex flex-col gap-1.5 opacity-50 cursor-not-allowed">
            <CreditCard className="w-5 h-5 text-neutral-400" />
            <p className="text-xs font-bold text-neutral-500">Cartão de Crédito (em breve)</p>
            <p className="text-[11px] text-neutral-400 leading-tight">Indisponível até concluir a integração segura.</p>
          </button>

          <button type="button" disabled className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50 text-left flex flex-col gap-1.5 opacity-50 cursor-not-allowed">
            <FileText className="w-5 h-5 text-neutral-400" />
            <p className="text-xs font-bold text-neutral-500">Boleto (em breve)</p>
            <p className="text-[11px] text-neutral-400 leading-tight">Indisponível até concluir a integração segura.</p>
          </button>
        </div>

        {/* DETAILS FOR SELECTED METHOD */}

        {/* 1. PIX DETAILS */}
        {selectedBillingType === 'PIX' && (
          <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-200/60 pb-3">
              <div>
                <h4 className="text-xs font-bold text-neutral-900 flex items-center gap-1.5">
                  <QrCode className="w-4 h-4 text-emerald-700" />
                  <span>{pendingInvoice ? 'Fatura pendente · Pix Copia e Cola & QR Code (R$ 129,90)' : 'Nenhuma fatura Pix pendente'}</span>
                </h4>
                <p className="text-[11px] text-neutral-500">
                  {pendingInvoice ? 'Cobrança Pix retornada pelo Asaas.' : 'Se a conta estiver em teste grátis, nenhuma cobrança é criada durante o período de teste.'}
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                Valor: R$ 129,90
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
              {/* QR Code Display */}
              <div className="flex flex-col items-center justify-center p-4 bg-white border border-neutral-200 rounded-xl shadow-sm text-center">
                {pendingInvoice?.pixQrCodeBase64 ? (
                  <img
                    src={pendingInvoice.pixQrCodeBase64}
                    alt="QR Code Pix Asaas"
                    className="w-44 h-44 object-contain rounded"
                  />
                ) : (
                  <div className="w-44 h-44 bg-neutral-100 rounded flex items-center justify-center text-neutral-400">
                    <QrCode className="w-16 h-16 opacity-30" />
                  </div>
                )}
                <p className="text-[11px] text-neutral-500 mt-2 font-medium">
                  {pendingInvoice ? 'Aponte o app do seu banco para o QR Code' : 'QR Code indisponível sem fatura pendente'}
                </p>
              </div>

              {/* Copia e Cola & Instructions */}
              <div className="md:col-span-2 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-800 mb-1">
                    Código Pix Copia e Cola (Asaas Recorrência):
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={
                        pendingInvoice?.pixCopiaECola || ''
                      }
                      className="flex-1 p-2.5 bg-white border border-neutral-200 rounded-lg text-xs font-mono text-neutral-700 select-all"
                    />
                    <button
                      type="button"
                      disabled={!pendingInvoice?.pixCopiaECola}
                      onClick={() =>
                        handleCopy(
                          pendingInvoice?.pixCopiaECola || '',
                          'Código Pix Asaas'
                        )
                      }
                      className="px-4 py-2.5 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap"
                    >
                      {copiedCode === 'Código Pix Asaas' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copiar Pix</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {!pendingInvoice && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
                    Não existe cobrança pendente. O teste grátis de 15 dias não cria cobrança automática. A contratação paga deve ser iniciada pelo fluxo de assinatura.
                  </div>
                )}
                {pendingInvoice && (
                <div className="p-3 bg-white border border-neutral-200 rounded-lg space-y-1.5 text-xs text-neutral-600">
                  <p className="font-semibold text-neutral-900 flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5 text-amber-500" />
                    <span>Como funciona a renovação mensal:</span>
                  </p>
                  <p className="text-[11px] leading-relaxed">
                    1. Copie o código acima ou escaneie o QR Code no aplicativo do seu banco.
                  </p>
                  <p className="text-[11px] leading-relaxed">
                    2. Após a confirmação do pagamento pelo Asaas, o webhook atualiza a situação da assinatura. O prazo depende do provedor e da compensação bancária.
                  </p>
                </div>
                )}

              </div>
            </div>
          </div>
        )}

      </div>

      {/* Invoices History Table */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h4 className="text-xs font-bold text-neutral-900">
              Histórico de Faturas &amp; Mensalidades (Asaas Recorrência)
            </h4>
            <p className="text-[11px] text-neutral-500">
              Registro contábil de todas as renovações mensais de R$ 129,90 da plataforma.
            </p>
          </div>
          <span className="text-xs text-neutral-500 font-mono">
            Total Registrado: {subscription?.invoices?.length || 0} faturas
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-700 font-semibold">
              <tr>
                <th className="p-3 text-left">Mês de Referência</th>
                <th className="p-3 text-left">ID da Fatura Asaas</th>
                <th className="p-3 text-left">Forma de Pagamento</th>
                <th className="p-3 text-right">Valor</th>
                <th className="p-3 text-center">Status Asaas</th>
                <th className="p-3 text-right">Ação / Comprovante</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {subscription?.invoices?.map((inv) => (
                <tr key={inv.id} className="hover:bg-neutral-50/50">
                  <td className="p-3 font-semibold text-neutral-900">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-neutral-400" />
                      <span>{inv.referenceMonth}</span>
                    </div>
                  </td>
                  <td className="p-3 font-mono text-[11px] text-neutral-600">
                    {inv.id}
                  </td>
                  <td className="p-3 text-neutral-600">
                    <span className="inline-flex items-center gap-1">
                      {inv.billingType === 'PIX' ? (
                        <>
                          <QrCode className="w-3 h-3 text-emerald-600" />
                          <span>Pix Asaas</span>
                        </>
                      ) : inv.billingType === 'CREDIT_CARD' ? (
                        <>
                          <CreditCard className="w-3 h-3 text-blue-600" />
                          <span>Cartão Recorrente</span>
                        </>
                      ) : (
                        <>
                          <FileText className="w-3 h-3 text-amber-600" />
                          <span>Boleto Registrado</span>
                        </>
                      )}
                    </span>
                  </td>
                  <td className="p-3 text-right font-mono font-bold text-neutral-900 tabular-nums">
                    R$ {inv.value.toFixed(2).replace('.', ',')}
                  </td>
                  <td className="p-3 text-center">
                    {inv.status === 'RECEIVED' || inv.status === 'CONFIRMED' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Liquidado</span>
                      </span>
                    ) : inv.status === 'OVERDUE' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
                        <AlertTriangle className="w-3 h-3" />
                        <span>Vencido</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                        <Clock className="w-3 h-3" />
                        <span>Aguardando Pgto</span>
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <button
                      type="button"
                      onClick={() =>
                        showToast(
                          'info',
                          `Abrindo comprovante oficial da fatura Asaas #${inv.id} (R$ ${inv.value.toFixed(2)})...`
                        )
                      }
                      className="text-xs text-neutral-700 hover:text-neutral-950 font-medium underline inline-flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" />
                      <span>Comprovante Asaas</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Subscription Action & SLA Footer */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-neutral-50 border border-neutral-200 rounded-xl text-xs text-neutral-600">
        <div className="space-y-0.5">
          <p className="font-semibold text-neutral-900 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Garantia de Continuidade &bull; Régua de Cobrança Asaas:</span>
          </p>
          <p className="text-[11px] text-neutral-500">
            D+0: Aviso cordial &bull; D+3: Tolerância operacional &bull; D+7: Pausa do cardápio público &bull; D+30: Quarentena de backup segura.
          </p>
        </div>

        <button
          type="button"
          onClick={handleToggleSubscriptionStatus}
          className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
            subscription?.status === 'CANCELLED'
              ? 'bg-emerald-700 hover:bg-emerald-600 text-white'
              : 'bg-white hover:bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {subscription?.status === 'CANCELLED' ? 'Reativar Assinatura no Asaas' : 'Cancelar Assinatura Mensal'}
        </button>
      </div>
    </div>
  );
};
