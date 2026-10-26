import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  QrCode,
  CheckCircle2,
  ArrowRight,
  Lock,
  ShieldCheck,
  Store,
  Copy,
  Check,
  FileText,
  AlertCircle,
  KeyRound,
  UserCheck,
  Sliders,
  RefreshCw,
  AlertTriangle,
  Zap,
} from 'lucide-react';
import { AsaasBillingType, AsaasSubscriptionData, AuthSession, RestaurantTenant } from '../types';

interface ProjectKickoffViewProps {
  onTenantCreated: (tenant: RestaurantTenant) => void;
  onNavigateToView: (view: 'consumer' | 'admin') => void;
  onSessionAuthenticated?: (session: AuthSession) => void;
}

export const ProjectKickoffView: React.FC<ProjectKickoffViewProps> = ({
  onTenantCreated,
  onNavigateToView,
  onSessionAuthenticated,
}) => {
  // Onboarding Gate State: Step 1 (Subscription or 15-Day Free Trial Signup) -> Step 2 (Create Restaurant & Menu)
  const [activeStep, setActiveStep] = useState<'subscription' | 'restaurant'>('subscription');
  const [signupMode, setSignupMode] = useState<'trial_15_days' | 'paid_direct'>('trial_15_days');
  const [subscriptionConfirmed, setSubscriptionConfirmed] = useState(false);
  const [lockedStepWarning, setLockedStepWarning] = useState(false);

  // Gateway Asaas Configuration State
  const [gatewayConfig, setGatewayConfig] = useState<{
    configured: boolean;
    environment: 'sandbox' | 'production';
    apiKeyMasked: string;
    apiUrl: string;
  }>({
    configured: false,
    environment: 'sandbox',
    apiKeyMasked: '',
    apiUrl: 'https://sandbox.asaas.com/v3',
  });
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configApiKeyInput, setConfigApiKeyInput] = useState('');
  const [configEnvInput, setConfigEnvInput] = useState<'sandbox' | 'production'>('production');
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [configSaveNotice, setConfigSaveNotice] = useState<string | null>(null);

  // Step 1: Subscriber Account & Asaas Plan State
  const [subscriberName, setSubscriberName] = useState('');
  const [subscriberCpfCnpj, setSubscriberCpfCnpj] = useState('');
  const [subscriberEmail, setSubscriberEmail] = useState('');
  const [subscriberPassword, setSubscriberPassword] = useState('');
  const [subscriberPhone, setSubscriberPhone] = useState('');
  const [billingType, setBillingType] = useState<AsaasBillingType>('PIX');

  // Credit Card fields
  const [ccNumber, setCcNumber] = useState('');
  const [ccHolder, setCcHolder] = useState('');
  const [ccExpiry, setCcExpiry] = useState('');
  const [ccCvv, setCcCvv] = useState('');

  // Generated Asaas Subscription & Pix Invoice State
  const [isProcessingSub, setIsProcessingSub] = useState(false);
  const [subscriptionData, setSubscriptionData] = useState<AsaasSubscriptionData | null>(null);
  const [pixInvoiceData, setPixInvoiceData] = useState<{
    invoiceId: string;
    pixCopiaECola: string;
    pixQrCodeBase64?: string;
    dueDate: string;
  } | null>(null);
  const [copiedPix, setCopiedPix] = useState(false);
  const [subError, setSubError] = useState<string | null>(null);
  const [isAutoCheckingPayment, setIsAutoCheckingPayment] = useState(false);

  // Step 2: Restaurant & Digital Menu Creation State (Unlocked ONLY after subscriptionConfirmed = true)
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [isSlugCustomized, setIsSlugCustomized] = useState(false);
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [pixKey, setPixKey] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#059669');
  const [isCreating, setIsCreating] = useState(false);
  const [createdTenant, setCreatedTenant] = useState<RestaurantTenant | null>(null);
  const [tenantError, setTenantError] = useState<string | null>(null);

  const onboardingTempSlug = `assinante_${subscriberCpfCnpj.replace(/\D/g, '') || 'novo'}`;

  // Fetch Gateway Configuration on load
  const fetchGatewayConfig = async () => {
    try {
      const res = await fetch('/api/v1/asaas/config');
      if (res.ok) {
        const data = await res.json();
        if (data.config) {
          setGatewayConfig(data.config);
          setConfigEnvInput(data.config.environment);
        }
      }
    } catch {
      // Ignored fallback
    }
  };

  useEffect(() => {
    fetchGatewayConfig();
  }, []);

  // Automated live polling to detect when Pix invoice is paid
  useEffect(() => {
    if (!pixInvoiceData || subscriptionConfirmed) return;

    let isMounted = true;
    const interval = setInterval(async () => {
      if (subscriptionConfirmed) return;
      try {
        setIsAutoCheckingPayment(true);
        const res = await fetch(`/api/v1/asaas/subscription/${onboardingTempSlug}/check-status`);
        if (res.ok) {
          const data = await res.json();
          if (data.paid && (data.status === 'RECEIVED' || data.status === 'CONFIRMED')) {
            if (isMounted) {
              setSubscriptionConfirmed(true);
              setLockedStepWarning(false);
              if (!phone) setPhone(subscriberPhone);
              setActiveStep('restaurant');
            }
          }
        }
      } catch {
        // Silent poll error
      } finally {
        if (isMounted) setIsAutoCheckingPayment(false);
      }
    }, 3500);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [pixInvoiceData, subscriptionConfirmed, onboardingTempSlug, phone, subscriberPhone]);

  // Step 1 Handler: Generate Pix/Boleto Invoice or Process Credit Card Subscription
  const handleSubscribeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubError(null);

    if (!subscriberName.trim() || !subscriberCpfCnpj.trim() || !subscriberEmail.trim() || !subscriberPassword.trim() || !subscriberPhone.trim()) {
      setSubError('Preencha todos os dados cadastrais do assinante e defina sua senha de acesso.');
      return;
    }

    if (subscriberPassword.trim().length < 6) {
      setSubError('A senha de acesso deve ter pelo menos 6 caracteres.');
      return;
    }

    // 15-DAY FREE TRIAL MODE
    if (signupMode === 'trial_15_days') {
      setIsProcessingSub(true);
      try {
        const trialRes = await fetch(`/api/v1/asaas/subscription/${onboardingTempSlug}/start-trial`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerName: subscriberName.trim(),
            customerEmail: subscriberEmail.trim(),
            customerCpfCnpj: subscriberCpfCnpj.trim(),
            customerPhone: subscriberPhone.replace(/\D/g, ''),
            billingType: 'PIX',
          }),
        });
        const trialJson = await trialRes.json();
        if (!trialRes.ok || !trialJson.subscription) {
          setSubError(trialJson.error || 'Não foi possível ativar o período de teste grátis de 15 dias.');
          setIsProcessingSub(false);
          return;
        }

        setSubscriptionData(trialJson.subscription);
        setSubscriptionConfirmed(true);
        setLockedStepWarning(false);
        if (!phone) setPhone(subscriberPhone);
        setActiveStep('restaurant');
      } catch {
        setSubError('Erro de comunicação ao ativar o teste grátis de 15 dias. Tente novamente.');
      } finally {
        setIsProcessingSub(false);
      }
      return;
    }

    if (billingType === 'CREDIT_CARD') {
      if (!ccNumber.trim() || !ccHolder.trim() || !ccExpiry.trim() || !ccCvv.trim()) {
        setSubError('Preencha todos os dados do cartão de crédito para ativar a assinatura.');
        return;
      }
    }

    setIsProcessingSub(true);

    try {
      const res = await fetch(`/api/v1/asaas/subscription/${onboardingTempSlug}/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billingType,
          customerName: subscriberName.trim(),
          customerEmail: subscriberEmail.trim(),
          customerCpfCnpj: subscriberCpfCnpj.trim(),
          customerPhone: subscriberPhone.replace(/\D/g, ''),
          creditCardNumber: billingType === 'CREDIT_CARD' ? ccNumber : undefined,
          creditCardHolder: billingType === 'CREDIT_CARD' ? ccHolder : undefined,
          creditCardExpiry: billingType === 'CREDIT_CARD' ? ccExpiry : undefined,
          creditCardCcv: billingType === 'CREDIT_CARD' ? ccCvv : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.subscription) {
        setSubError(data.error || 'Não foi possível processar a assinatura no Asaas.');
        setIsProcessingSub(false);
        return;
      }

      setSubscriptionData(data.subscription);

      if (billingType === 'CREDIT_CARD') {
        // Credit card is authorized immediately -> unlock Step 2 and advance
        setSubscriptionConfirmed(true);
        setLockedStepWarning(false);
        if (!phone) setPhone(subscriberPhone);
        setActiveStep('restaurant');
      } else if (billingType === 'PIX') {
        // Generate Pix QR Code for the R$ 129,90 invoice
        const pixRes = await fetch(`/api/v1/asaas/subscription/${onboardingTempSlug}/generate-pix`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        if (pixRes.ok) {
          const pixData = await pixRes.json();
          setPixInvoiceData({
            invoiceId: pixData.invoiceId,
            pixCopiaECola: pixData.pixCopiaECola,
            pixQrCodeBase64: pixData.pixQrCodeBase64,
            dueDate: pixData.dueDate,
          });
        }
      }
    } catch {
      setSubError('Erro de comunicação ao registrar assinatura. Tente novamente.');
    } finally {
      setIsProcessingSub(false);
    }
  };

  // Confirm Pix / Boleto payment to unlock Step 2
  const handleConfirmInvoicePayment = async () => {
    setIsProcessingSub(true);
    setSubError(null);
    try {
      const res = await fetch(`/api/v1/asaas/subscription/${onboardingTempSlug}/confirm-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) {
        setSubError(data.error || 'O Asaas ainda não identificou o pagamento de R$ 129,90.');
        setIsProcessingSub(false);
        return;
      }
      setSubscriptionConfirmed(true);
      setLockedStepWarning(false);
      if (!phone) setPhone(subscriberPhone);
      setActiveStep('restaurant');
    } catch {
      setSubError('Erro ao comunicar com o servidor para confirmar pagamento.');
    } finally {
      setIsProcessingSub(false);
    }
  };

  // Save Gateway Credentials directly from onboarding
  const handleSaveAsaasConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!configApiKeyInput.trim()) {
      setConfigSaveNotice('Informe a chave da API do Asaas ($aact_...).');
      return;
    }
    setIsSavingConfig(true);
    setConfigSaveNotice(null);
    try {
      const res = await fetch('/api/v1/asaas/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          environment: configEnvInput,
          apiKey: configApiKeyInput.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.config) {
        setGatewayConfig(data.config);
        setShowConfigModal(false);
        setConfigApiKeyInput('');
      } else {
        setConfigSaveNotice(data.error || 'Erro ao salvar credenciais.');
      }
    } catch {
      setConfigSaveNotice('Erro ao comunicar com o servidor.');
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleCopyPix = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedPix(true);
    setTimeout(() => setCopiedPix(false), 3000);
  };

  // Step 2 Handler: Create Restaurant & Digital Menu (Only allowed when subscriptionConfirmed === true)
  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subscriptionConfirmed) {
      setLockedStepWarning(true);
      setActiveStep('subscription');
      return;
    }

    setTenantError(null);
    setIsCreating(true);

    try {
      const res = await fetch('/api/v1/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          slug,
          phone,
          address,
          primaryColor,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setTenantError(json.error || 'Não foi possível criar o restaurante. Verifique se o link já está em uso.');
        setIsCreating(false);
        return;
      }

      const isTrialActivation = Boolean(subscriptionData?.isTrial || signupMode === 'trial_15_days');
      let boundSubscription = subscriptionData;

      if (isTrialActivation) {
        // Bind 15-day Free Trial subscription to the newly created restaurant slug
        try {
          const bindTrialRes = await fetch(`/api/v1/asaas/subscription/${slug}/start-trial`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              customerName: subscriberName.trim() || name,
              customerEmail: subscriberEmail.trim(),
              customerCpfCnpj: subscriberCpfCnpj.trim(),
              customerPhone: phone.replace(/\D/g, ''),
              billingType: 'PIX',
            }),
          });
          if (bindTrialRes.ok) {
            const bindTrialJson = await bindTrialRes.json();
            if (bindTrialJson.subscription) {
              boundSubscription = bindTrialJson.subscription;
            }
          }
        } catch {
          // fallback to existing subscriptionData
        }
      } else {
        // Bind the active paid Asaas subscription to the newly created restaurant slug
        await fetch(`/api/v1/asaas/subscription/${slug}/subscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            billingType,
            customerName: subscriberName.trim() || name,
            customerEmail: subscriberEmail.trim(),
            customerCpfCnpj: subscriberCpfCnpj.trim(),
            customerPhone: phone.replace(/\D/g, ''),
          }),
        }).catch(() => {});

        await fetch(`/api/v1/asaas/subscription/${slug}/confirm-payment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }).catch(() => {});
      }

      const tenantData: RestaurantTenant = {
        id: json.data?.id || `tenant_${Date.now()}`,
        name,
        slug,
        phone,
        address,
        primaryColor,
        backgroundColor: '#FAFAFA',
        fontFamily: 'Plus Jakarta Sans',
        isOpen: true,
        openingHoursText: 'Segunda a Domingo: 18:00 às 23:45',
        deliveryEnabled: true,
        pickupEnabled: true,
        deliveryFeeCents: 900,
        minOrderCents: 3000,
        evolutionInstanceId: `instancia_${slug}`,
        evolutionStatus: 'connected',
        evolutionApiKeyConfigured: true,
        subscriptionStatus: isTrialActivation ? 'trial' : 'active',
        trialEndsAt: boundSubscription?.trialEndsAt,
        asaasSubscription: boundSubscription || undefined,
        pixConfig: {
          provider: 'direct_bank',
          pixKey: pixKey.trim() || subscriberCpfCnpj.trim() || phone.trim(),
          pixKeyType: 'cnpj',
          merchantName: name.slice(0, 25),
          merchantCity: 'SAO PAULO',
          autoApproveWebhook: true,
        },
      };

      // Register & authenticate the subscriber as TENANT_OWNER of this restaurant
      if (subscriberEmail && subscriberPassword) {
        try {
          const authRes = await fetch('/api/v1/auth/register-tenant-owner', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: subscriberName.trim(),
              email: subscriberEmail.trim(),
              password: subscriberPassword,
              phone: phone.replace(/\D/g, ''),
              tenantId: tenantData.id,
              tenantSlug: tenantData.slug,
              tenantName: tenantData.name,
            }),
          });
          if (authRes.ok) {
            const authData = await authRes.json();
            if (authData.success && onSessionAuthenticated) {
              onSessionAuthenticated({
                token: authData.token,
                user: authData.user,
                claims: authData.claims,
                authMethod: 'password',
                authenticatedAt: authData.authenticatedAt,
              });
            }
          }
        } catch {
          // ignore auth registration fallback error
        }
      }

      setCreatedTenant(tenantData);
      onTenantCreated(tenantData);
    } catch {
      setTenantError('Erro ao criar o cardápio do restaurante. Tente novamente.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header & 2-Step Onboarding Progress Bar */}
      <div className="bg-white border border-neutral-200 rounded-2xl p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 mb-1">
              <span>Aladay Cardápios Digitais</span>
              <span aria-hidden="true">&middot;</span>
              <span>Teste Grátis 15 Dias ou Assinatura Oficial</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-950">
              {activeStep === 'subscription'
                ? signupMode === 'trial_15_days'
                  ? '1. Cadastro para Período de Teste Grátis (15 Dias)'
                  : '1. Cadastro da Assinatura do Plano (R$ 129,90/mês)'
                : '2. Criar Restaurante & Gerar Cardápio Digital'}
            </h1>
            <p className="text-xs text-neutral-600 mt-1 max-w-2xl">
              {activeStep === 'subscription'
                ? signupMode === 'trial_15_days'
                  ? 'Cadastre seus dados abaixo para liberar 15 dias de teste grátis com todos os recursos (Cardápio Digital, Pix Direto, KDS e WhatsApp Automático) sem cobrança hoje.'
                  : 'Conclua o cadastro da sua assinatura mensal fixa de R$ 129,90/mês para liberar imediatamente a criação do seu restaurante e cardápio digital.'
                : subscriptionData?.isTrial
                ? 'Seu Período de Teste Grátis de 15 Dias está ativo! Agora preencha os dados do seu restaurante para colocar seu cardápio digital no ar.'
                : 'Sua assinatura está ativa! Agora preencha os dados do seu estabelecimento para colocar seu cardápio digital no ar.'}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                subscriptionConfirmed
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border-amber-200'
              }`}
            >
              {subscriptionConfirmed ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>
                    {subscriptionData?.isTrial
                      ? 'Teste Grátis de 15 Dias Ativo'
                      : 'Assinatura Ativa (R$ 129,90/mês)'}
                  </span>
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5 text-amber-600" />
                  <span>
                    {signupMode === 'trial_15_days'
                      ? 'Aguardando Cadastro do Teste Grátis'
                      : 'Aguardando Assinatura do Plano'}
                  </span>
                </>
              )}
            </span>
          </div>
        </div>

        {/* 2-Step Gated Navigation Tabs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-neutral-100">
          <button
            type="button"
            onClick={() => setActiveStep('subscription')}
            className={`p-3.5 rounded-xl border text-left transition-all flex items-center justify-between cursor-pointer ${
              activeStep === 'subscription'
                ? 'bg-neutral-900 text-white border-neutral-900'
                : subscriptionConfirmed
                ? 'bg-emerald-50/70 text-emerald-950 border-emerald-200 hover:bg-emerald-50'
                : 'bg-neutral-50 text-neutral-700 border-neutral-200'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                  activeStep === 'subscription'
                    ? 'bg-emerald-500 text-neutral-950'
                    : subscriptionConfirmed
                    ? 'bg-emerald-600 text-white'
                    : 'bg-neutral-200 text-neutral-700'
                }`}
              >
                {subscriptionConfirmed ? <Check className="w-4 h-4" /> : '1'}
              </div>
              <div>
                <p className="text-xs font-bold">Passo 1: Assinatura do Plano</p>
                <p
                  className={`text-[11px] ${
                    activeStep === 'subscription' ? 'text-neutral-300' : 'text-neutral-500'
                  }`}
                >
                  Cadastro do assinante e ativação R$ 129,90/mês
                </p>
              </div>
            </div>
            {subscriptionConfirmed && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                Concluído
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              if (!subscriptionConfirmed) {
                setLockedStepWarning(true);
                return;
              }
              setLockedStepWarning(false);
              setActiveStep('restaurant');
            }}
            className={`p-3.5 rounded-xl border text-left transition-all flex items-center justify-between cursor-pointer ${
              activeStep === 'restaurant'
                ? 'bg-neutral-900 text-white border-neutral-900'
                : subscriptionConfirmed
                ? 'bg-white text-neutral-900 border-neutral-200 hover:border-neutral-300'
                : 'bg-neutral-100 text-neutral-400 border-neutral-200 opacity-80'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                  activeStep === 'restaurant'
                    ? 'bg-emerald-500 text-neutral-950'
                    : subscriptionConfirmed
                    ? 'bg-neutral-900 text-white'
                    : 'bg-neutral-200 text-neutral-500'
                }`}
              >
                {subscriptionConfirmed ? '2' : <Lock className="w-3.5 h-3.5" />}
              </div>
              <div>
                <p className="text-xs font-bold">Passo 2: Criar Restaurante &amp; Cardápio</p>
                <p
                  className={`text-[11px] ${
                    activeStep === 'restaurant' ? 'text-neutral-300' : 'text-neutral-500'
                  }`}
                >
                  {subscriptionConfirmed
                    ? 'Liberado! Configure sua loja e cardápio digital'
                    : 'Bloqueado até a confirmação da assinatura'}
                </p>
              </div>
            </div>
            {!subscriptionConfirmed && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-neutral-200 text-neutral-600 flex items-center gap-1">
                <Lock className="w-3 h-3" />
                <span>Requer Assinatura</span>
              </span>
            )}
          </button>
        </div>

        {lockedStepWarning && !subscriptionConfirmed && (
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Atenção:</strong> Só é possível cadastrar o restaurante e criar o cardápio digital após concluir a assinatura do plano de <strong>R$ 129,90/mês</strong> abaixo.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setLockedStepWarning(false)}
              className="text-[11px] font-semibold text-amber-800 underline cursor-pointer shrink-0"
            >
              Entendi
            </button>
          </div>
        )}
      </div>

      {/* ================================================================== */}
      {/* STEP 1: SUBSCRIPTION SIGNUP & PAYMENT (ASAAS R$ 129,90/MÊS)        */}
      {/* ================================================================== */}
      {activeStep === 'subscription' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Subscriber Registration & Payment Method */}
          <div className="lg:col-span-7 bg-white border border-neutral-200 rounded-2xl p-6 space-y-6">
            {/* Gateway Status Banner (Transparent & Actionable) */}
            <div
              className={`p-4 rounded-xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                gatewayConfig.configured
                  ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
                  : 'bg-amber-50/90 border-amber-200 text-amber-950'
              }`}
            >
              <div className="flex items-start gap-3">
                {gatewayConfig.configured ? (
                  <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold">
                      {gatewayConfig.configured
                        ? `Gateway Asaas Conectado (${gatewayConfig.environment.toUpperCase()})`
                        : 'Atenção: Gateway Asaas em Modo Demonstração'}
                    </span>
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-semibold ${
                        gatewayConfig.configured
                          ? 'bg-emerald-200 text-emerald-900'
                          : 'bg-amber-200 text-amber-900'
                      }`}
                    >
                      {gatewayConfig.configured ? 'Cobrança Real Ativa' : 'Sem Débito no Banco/Cartão'}
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-600 mt-1 leading-relaxed">
                    {gatewayConfig.configured
                      ? `Todas as assinaturas de R$ 129,90/mês geram cobranças reais diretamente na sua conta Asaas oficial (Chave ${gatewayConfig.apiKeyMasked}).`
                      : 'Nenhuma chave de produção (ASAAS_API_KEY) está configurada no arquivo de ambiente (.env). Por esse motivo, os testes de criação não debitam dinheiro real da sua conta bancária ou cartão.'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowConfigModal(true)}
                className={`px-3 py-1.5 rounded-lg font-semibold text-xs shrink-0 flex items-center gap-1.5 transition-colors cursor-pointer self-start sm:self-center ${
                  gatewayConfig.configured
                    ? 'bg-emerald-700 hover:bg-emerald-800 text-white'
                    : 'bg-amber-700 hover:bg-amber-800 text-white'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>{gatewayConfig.configured ? 'Alterar Chave Asaas' : 'Configurar Chave Asaas'}</span>
              </button>
            </div>

            <div className="pb-3 border-b border-neutral-200 flex items-center justify-between">
              <h2 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-emerald-600" />
                <span>Dados do Assinante &amp; Conta de Acesso</span>
              </h2>
              <span className="text-[11px] font-mono text-neutral-500">
                {gatewayConfig.configured ? 'Asaas v3 Produção' : 'Asaas Modo Demonstração'}
              </span>
            </div>

            {subError && (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{subError}</span>
              </div>
            )}

            <form onSubmit={handleSubscribeSubmit} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Nome Completo ou Razão Social
                  </label>
                  <input
                    type="text"
                    required
                    value={subscriberName}
                    onChange={(e) => setSubscriberName(e.target.value)}
                    placeholder="Ex: Carlos Eduardo Mendes"
                    className="w-full p-2.5 text-xs border border-neutral-200 rounded-xl text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    CPF ou CNPJ do Assinante
                  </label>
                  <input
                    type="text"
                    required
                    value={subscriberCpfCnpj}
                    onChange={(e) => setSubscriberCpfCnpj(e.target.value)}
                    placeholder="00.000.000/0001-00 ou CPF"
                    className="w-full p-2.5 text-xs border border-neutral-200 rounded-xl text-neutral-900 font-mono focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    E-mail de Acesso ao Painel
                  </label>
                  <input
                    type="email"
                    required
                    value={subscriberEmail}
                    onChange={(e) => setSubscriberEmail(e.target.value)}
                    placeholder="contato@seurestaurante.com.br"
                    className="w-full p-2.5 text-xs border border-neutral-200 rounded-xl text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Crie sua Senha de Acesso
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={subscriberPassword}
                    onChange={(e) => setSubscriberPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full p-2.5 text-xs border border-neutral-200 rounded-xl text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  WhatsApp do Responsável (com DDD)
                </label>
                <input
                  type="tel"
                  required
                  value={subscriberPhone}
                  onChange={(e) => setSubscriberPhone(e.target.value)}
                  placeholder="Ex: 11987654321"
                  className="w-full p-2.5 text-xs border border-neutral-200 rounded-xl text-neutral-900 font-mono focus:outline-none focus:ring-2 focus:ring-neutral-900"
                />
              </div>

              {/* Mode Selector: 15-Day Free Trial vs Direct Paid Subscription */}
              <div className="pt-2 border-t border-neutral-200 space-y-4">
                <label className="block text-xs font-bold text-neutral-900">
                  Escolha como deseja começar na Aladay:
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSignupMode('trial_15_days')}
                    className={`p-4 rounded-xl border text-left transition-all cursor-pointer relative ${
                      signupMode === 'trial_15_days'
                        ? 'bg-emerald-50/90 border-2 border-emerald-600 text-emerald-950 shadow-xs'
                        : 'bg-neutral-50 border-neutral-200 text-neutral-600 hover:bg-neutral-100'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-600 text-white">
                        15 Dias Grátis
                      </span>
                      <span className="font-mono text-xs font-black text-emerald-700">R$ 0,00 hoje</span>
                    </div>
                    <p className="text-xs font-bold text-neutral-950 mt-1">
                      Período de Teste Grátis (15 Dias)
                    </p>
                    <p className="text-[11px] text-neutral-600 mt-0.5 leading-snug">
                      Liberação imediata sem cobrança hoje. Teste todos os recursos por 15 dias completos.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSignupMode('paid_direct')}
                    className={`p-4 rounded-xl border text-left transition-all cursor-pointer relative ${
                      signupMode === 'paid_direct'
                        ? 'bg-emerald-50/90 border-2 border-emerald-600 text-emerald-950 shadow-xs'
                        : 'bg-neutral-50 border-neutral-200 text-neutral-600 hover:bg-neutral-100'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-neutral-200 text-neutral-800">
                        Assinatura Direta
                      </span>
                      <span className="font-mono text-xs font-bold text-neutral-900">R$ 129,90/mês</span>
                    </div>
                    <p className="text-xs font-bold text-neutral-950 mt-1">
                      Ativação Definitiva Plano Pro
                    </p>
                    <p className="text-[11px] text-neutral-600 mt-0.5 leading-snug">
                      Pagamento imediato via Pix, Cartão de Crédito ou Boleto Asaas.
                    </p>
                  </button>
                </div>

                {signupMode === 'trial_15_days' ? (
                  <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-emerald-950 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Resumo do Seu Período de Teste Grátis (15 Dias)</span>
                      </span>
                      <span className="font-mono text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                        Sem Cartão Obrigatório
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[11px]">
                      <div className="p-2.5 bg-white rounded-lg border border-emerald-100">
                        <p className="text-neutral-500">Valor cobrado hoje:</p>
                        <p className="font-mono font-black text-emerald-700 text-sm">R$ 0,00 (Grátis)</p>
                      </div>
                      <div className="p-2.5 bg-white rounded-lg border border-emerald-100">
                        <p className="text-neutral-500">Duração do teste:</p>
                        <p className="font-mono font-bold text-neutral-900 text-sm">15 dias corridos</p>
                      </div>
                      <div className="p-2.5 bg-white rounded-lg border border-emerald-100">
                        <p className="text-neutral-500">Vencimento após teste:</p>
                        <p className="font-mono font-bold text-neutral-900 text-sm">
                          {new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                    </div>
                    <p className="text-[11px] text-neutral-600 leading-relaxed">
                      Você terá acesso integral ao Cardápio Digital, Pix 100% direto na sua conta, Painel KDS e WhatsApp Automático. Após os 15 dias, caso decida continuar, a mensalidade fixa é de <strong>R$ 129,90/mês</strong> (sem fidelidade).
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 pt-2">
                    <label className="block text-xs font-bold text-neutral-900">
                      Escolha a Forma de Pagamento da Assinatura (R$ 129,90/mês)
                    </label>

                    <div className="grid grid-cols-3 gap-2.5">
                      <button
                        type="button"
                        onClick={() => setBillingType('PIX')}
                        className={`p-3 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                          billingType === 'PIX'
                            ? 'bg-emerald-50 border-emerald-600 text-emerald-950 ring-1 ring-emerald-600'
                            : 'bg-neutral-50 border-neutral-200 text-neutral-600 hover:bg-neutral-100'
                        }`}
                      >
                        <QrCode className="w-4 h-4 text-emerald-600" />
                        <span>Pix Imediato</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setBillingType('CREDIT_CARD')}
                        className={`p-3 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                          billingType === 'CREDIT_CARD'
                            ? 'bg-emerald-50 border-emerald-600 text-emerald-950 ring-1 ring-emerald-600'
                            : 'bg-neutral-50 border-neutral-200 text-neutral-600 hover:bg-neutral-100'
                        }`}
                      >
                        <CreditCard className="w-4 h-4 text-emerald-600" />
                        <span>Cartão de Crédito</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setBillingType('BOLETO')}
                        className={`p-3 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                          billingType === 'BOLETO'
                            ? 'bg-emerald-50 border-emerald-600 text-emerald-950 ring-1 ring-emerald-600'
                            : 'bg-neutral-50 border-neutral-200 text-neutral-600 hover:bg-neutral-100'
                        }`}
                      >
                        <FileText className="w-4 h-4 text-emerald-600" />
                        <span>Boleto Asaas</span>
                      </button>
                    </div>

                    {/* Credit Card Form Fields */}
                    {billingType === 'CREDIT_CARD' && (
                      <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-xl space-y-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                            Número do Cartão de Crédito
                          </label>
                          <input
                            type="text"
                            required
                            value={ccNumber}
                            onChange={(e) => setCcNumber(e.target.value)}
                            placeholder="0000 0000 0000 0000"
                            className="w-full p-2.5 text-xs bg-white border border-neutral-200 rounded-lg font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                            Nome Impresso no Cartão
                          </label>
                          <input
                            type="text"
                            required
                            value={ccHolder}
                            onChange={(e) => setCcHolder(e.target.value.toUpperCase())}
                            placeholder="COMO ESTÁ NO CARTÃO"
                            className="w-full p-2.5 text-xs bg-white border border-neutral-200 rounded-lg"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                              Validade (MM/AA)
                            </label>
                            <input
                              type="text"
                              required
                              value={ccExpiry}
                              onChange={(e) => setCcExpiry(e.target.value)}
                              placeholder="12/29"
                              className="w-full p-2.5 text-xs bg-white border border-neutral-200 rounded-lg font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                              CVV
                            </label>
                            <input
                              type="text"
                              required
                              maxLength={4}
                              value={ccCvv}
                              onChange={(e) => setCcCvv(e.target.value)}
                              placeholder="123"
                              className="w-full p-2.5 text-xs bg-white border border-neutral-200 rounded-lg font-mono"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={isProcessingSub}
                className="w-full py-3.5 px-5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>
                  {isProcessingSub
                    ? signupMode === 'trial_15_days'
                      ? 'Ativando 15 Dias de Teste Grátis...'
                      : 'Processando Assinatura no Asaas...'
                    : signupMode === 'trial_15_days'
                    ? 'Ativar Meus 15 Dias Grátis e Criar Cardápio Digital'
                    : billingType === 'CREDIT_CARD'
                    ? 'Assinar Plano por R$ 129,90/mês e Liberar Criação do Cardápio'
                    : billingType === 'PIX'
                    ? 'Gerar QR Code Pix da Assinatura (R$ 129,90)'
                    : 'Gerar Boleto da Assinatura (R$ 129,90)'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            {/* Generated Pix or Boleto Payment Box */}
            {subscriptionData && !subscriptionConfirmed && (
              <div className="p-5 bg-emerald-50/70 border-2 border-emerald-500 rounded-2xl space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded flex items-center gap-1.5 w-fit">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                      <span>{gatewayConfig.configured ? 'Cobrança Oficial Asaas Gerada' : 'Cobrança em Modo Demonstração'}</span>
                    </span>
                    <h3 className="text-sm font-bold text-neutral-950 mt-1">
                      Efetue o pagamento de R$ 129,90 para desbloquear a criação do seu restaurante
                    </h3>
                  </div>
                  <span className="font-mono text-base font-bold text-emerald-800">R$ 129,90</span>
                </div>

                {billingType === 'PIX' && pixInvoiceData && (
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center bg-white p-4 rounded-xl border border-emerald-200">
                    {pixInvoiceData.pixQrCodeBase64 && (
                      <div className="sm:col-span-4 flex flex-col items-center gap-1">
                        <img
                          src={pixInvoiceData.pixQrCodeBase64}
                          alt="QR Code Pix Assinatura Aladay"
                          className="w-36 h-36 rounded-lg border border-neutral-200 p-1"
                        />
                        <span className="text-[10px] text-neutral-400 font-mono">
                          {gatewayConfig.configured ? 'Pix BACEN Oficial' : 'Simulação Local'}
                        </span>
                      </div>
                    )}
                    <div className={pixInvoiceData.pixQrCodeBase64 ? 'sm:col-span-8 space-y-2.5' : 'sm:col-span-12 space-y-2.5'}>
                      <p className="text-xs font-semibold text-neutral-800">
                        Pix Copia e Cola (Padrão Oficial BACEN):
                      </p>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={pixInvoiceData.pixCopiaECola}
                          className="w-full p-2 text-[11px] font-mono bg-neutral-50 border border-neutral-200 rounded-lg text-neutral-700"
                        />
                        <button
                          type="button"
                          onClick={() => handleCopyPix(pixInvoiceData.pixCopiaECola)}
                          className="px-3 py-2 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shrink-0 cursor-pointer"
                        >
                          {copiedPix ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedPix ? 'Copiado' : 'Copiar'}</span>
                        </button>
                      </div>

                      {/* Live polling status pill */}
                      <div className="flex items-center gap-2 text-[11px] text-neutral-600 bg-neutral-50 p-2 rounded-lg border border-neutral-100">
                        <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 ${isAutoCheckingPayment ? 'animate-spin' : ''}`} />
                        <span>
                          {gatewayConfig.configured
                            ? 'O sistema consulta o Asaas a cada 3s e liberará o restaurante assim que você pagar no app do banco.'
                            : 'Modo demonstração: o sistema aguarda confirmação manual sem debitar sua conta bancária.'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={handleConfirmInvoicePayment}
                    disabled={isProcessingSub}
                    className="w-full py-3.5 px-4 bg-neutral-950 hover:bg-neutral-800 text-white text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>
                      {isProcessingSub
                        ? 'Consultando Asaas...'
                        : gatewayConfig.configured
                        ? 'Verificar Pagamento no Asaas e Liberar Restaurante &rarr;'
                        : 'Simular Confirmação do Pagamento (Modo Demonstração) &rarr;'}
                    </span>
                  </button>

                  {!gatewayConfig.configured && (
                    <p className="text-[10px] text-center text-amber-800">
                      ℹ️ Nenhuma chave ASAAS_API_KEY configurada. O clique acima simulará a aprovação sem realizar cobrança bancária.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Plan Summary & Security Guarantee */}
          <div className="lg:col-span-5 bg-neutral-950 text-white border border-neutral-800 rounded-2xl p-6 space-y-6">
            <div className="flex items-baseline justify-between border-b border-neutral-800 pb-4">
              <div>
                <p className="text-xs text-emerald-400 font-medium">Resumo do Plano</p>
                <h3 className="text-lg font-bold text-white mt-0.5">Aladay Pro &middot; Multi-Tenant</h3>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold font-mono text-white">R$ 129,90</span>
                <span className="text-xs text-neutral-400">/mês</span>
              </div>
            </div>

            <div className="space-y-3 text-xs text-neutral-300">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>0% de comissão sobre vendas:</strong> Seu restaurante fica com 100% do valor dos pedidos pagos via Pix direto na sua conta bancária.
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Domínio próprio de cardápio:</strong> Link exclusivo <code className="text-emerald-300">aladay.com.br/sua-loja</code> liberado logo após a assinatura.
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>KDS Cozinha &amp; WhatsApp Automático:</strong> Avisos automáticos a cada mudança de status do pedido (Confirmado, Em Preparo, Saiu para Entrega).
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Importação rápida por planilha:</strong> Suba todos os seus produtos, preços e adicionais em segundos após ativar sua conta.
                </span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800 space-y-2 text-xs">
              <div className="flex items-center gap-2 text-amber-300 font-semibold">
                <KeyRound className="w-4 h-4" />
                <span>Por que assinar antes de criar o cardápio?</span>
              </div>
              <p className="text-neutral-400 leading-relaxed">
                Cada restaurante recebe um ambiente isolado de banco de dados, instância dedicada de WhatsApp e rota exclusiva na Cloudflare. A ativação da assinatura garante o provisionamento imediato dos recursos da sua loja.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* STEP 2: CREATE RESTAURANT & DIGITAL MENU (UNLOCKED AFTER SUB)      */}
      {/* ================================================================== */}
      {activeStep === 'restaurant' && subscriptionConfirmed && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Form Column */}
          <div className="lg:col-span-7 bg-white border border-neutral-200 rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-200">
              <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                <Store className="w-4 h-4 text-emerald-600" />
                <span>2. Dados do Restaurante &amp; Configuração do Cardápio Digital</span>
              </h3>
              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                Assinatura Confirmada
              </span>
            </div>

            {tenantError && (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{tenantError}</span>
              </div>
            )}

            <form onSubmit={handleCreateTenant} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Nome do Restaurante / Estabelecimento
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Pizzaria Bella Napoli"
                    value={name}
                    onChange={(e) => {
                      const newName = e.target.value;
                      setName(newName);
                      if (!isSlugCustomized) {
                        const autoSlug = newName
                          .toLowerCase()
                          .normalize('NFD')
                          .replace(/[\u0300-\u036f]/g, '')
                          .replace(/[^a-z0-9]/g, '-')
                          .replace(/-+/g, '-')
                          .replace(/^-|-$/g, '');
                        setSlug(autoSlug);
                      }
                    }}
                    className="w-full p-2.5 text-xs border border-neutral-200 rounded-lg text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Domínio &amp; Link do Cardápio
                  </label>
                  <div className="flex items-center">
                    <span className="text-xs text-neutral-600 bg-neutral-100 px-2.5 py-2.5 border border-r-0 border-neutral-200 rounded-l-lg font-mono font-medium">
                      aladay.com.br/
                    </span>
                    <input
                      type="text"
                      required
                      placeholder="pizzaria-bella-napoli"
                      value={slug}
                      onChange={(e) => {
                        setIsSlugCustomized(true);
                        setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                      }}
                      className="w-full p-2.5 text-xs border border-neutral-200 rounded-r-lg text-neutral-900 font-mono focus:outline-none focus:ring-1 focus:ring-neutral-400"
                    />
                  </div>
                  <p className="text-[11px] text-neutral-500 mt-1">
                    Link final:{' '}
                    <span className="font-mono text-emerald-700 font-semibold">
                      https://aladay.com.br/{slug || 'nome-do-restaurante'}
                    </span>
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    WhatsApp Oficial da Loja (com DDD)
                  </label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Ex: 11987654321"
                    className="w-full p-2.5 text-xs border border-neutral-200 rounded-lg text-neutral-900 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Cor Primária da Marca (Identidade Visual)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="w-10 h-9 p-0.5 border border-neutral-200 rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="flex-1 p-2 text-xs border border-neutral-200 rounded-lg font-mono text-neutral-900"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Endereço Físico Completo
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Av. Paulista, 1000 - Bela Vista, São Paulo - SP"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full p-2.5 text-xs border border-neutral-200 rounded-lg text-neutral-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Chave Pix do Restaurante (Recebimento 100% Direto)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="CNPJ, CPF, E-mail ou Celular da Loja"
                    value={pixKey}
                    onChange={(e) => setPixKey(e.target.value)}
                    className="w-full p-2.5 text-xs border border-neutral-200 rounded-lg text-neutral-900 font-mono"
                  />
                </div>
              </div>

              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 flex items-center justify-between">
                <span>Status da Assinatura:</span>
                <span className="font-bold text-emerald-800">
                  Plano Aladay Pro Ativo &bull; R$ 129,90/mês ({subscriberEmail})
                </span>
              </div>

              <button
                type="submit"
                disabled={isCreating}
                className="w-full py-3.5 px-4 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                {isCreating ? (
                  <span>Criando Restaurante e Publicando Cardápio Digital...</span>
                ) : (
                  <>
                    <span>Criar Restaurante &amp; Publicar Cardápio Digital</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Right Column: Created Output & Direct Access */}
          <div className="lg:col-span-5 bg-white border border-neutral-200 rounded-2xl p-6 space-y-5">
            <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2 pb-3 border-b border-neutral-200">
              <QrCode className="w-4 h-4 text-neutral-700" />
              <span>Ativação do Cardápio &amp; Painel do Lojista</span>
            </h3>

            {createdTenant ? (
              <div className="space-y-4">
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs space-y-2">
                  <div className="flex items-center gap-1.5 text-emerald-900 font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                    <span>Restaurante e Cardápio Criados com Sucesso!</span>
                  </div>
                  <p className="text-emerald-800">
                    O restaurante <strong>{createdTenant.name}</strong> já está ativo e autenticado na sua conta:
                  </p>
                  <div className="p-2.5 bg-white rounded-lg border border-emerald-300 font-mono text-[11px] text-emerald-900 font-bold select-all flex items-center justify-between">
                    <span>https://aladay.com.br/{createdTenant.slug}</span>
                    <span className="text-[10px] text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded font-sans font-medium">
                      Cardápio Ativo
                    </span>
                  </div>
                </div>

                <div className="space-y-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => onNavigateToView('admin')}
                    className="w-full py-3 px-4 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>Acessar Painel e Cadastrar Produtos do Cardápio</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => onNavigateToView('consumer')}
                    className="w-full py-3 px-4 text-xs font-semibold text-neutral-800 bg-neutral-100 hover:bg-neutral-200 rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>Visualizar Cardápio do Cliente ({createdTenant.name})</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-6 border border-dashed border-neutral-300 rounded-xl text-center space-y-3 text-neutral-500">
                <Store className="w-10 h-10 mx-auto text-emerald-600 stroke-1" />
                <p className="text-xs font-medium text-neutral-700">
                  Assinatura validada! Preencha os dados ao lado para publicar seu cardápio digital.
                </p>
                <p className="text-[11px] text-neutral-500">
                  Após clicar em &ldquo;Criar Restaurante&rdquo;, você será conectado automaticamente ao painel administrativo da sua loja para gerenciar produtos, categorias e pedidos.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Asaas API Key Configuration Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-neutral-200 space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-emerald-600" />
                <h3 className="text-sm font-bold text-neutral-900">
                  Configurar Credenciais Asaas
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowConfigModal(false);
                  setConfigSaveNotice(null);
                }}
                className="text-neutral-400 hover:text-neutral-700 text-lg leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            <p className="text-xs text-neutral-600 leading-relaxed">
              Informe sua chave de API para que as assinaturas mensais de <strong>R$ 129,90/mês</strong> debitem de verdade na sua conta Asaas.
            </p>

            {configSaveNotice && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800">
                {configSaveNotice}
              </div>
            )}

            <form onSubmit={handleSaveAsaasConfig} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Ambiente Asaas
                </label>
                <select
                  value={configEnvInput}
                  onChange={(e) => setConfigEnvInput(e.target.value as 'sandbox' | 'production')}
                  className="w-full p-2.5 text-xs border border-neutral-200 rounded-xl bg-white text-neutral-900"
                >
                  <option value="production">Produção Oficial (api.asaas.com - Cobranças Reais)</option>
                  <option value="sandbox">Sandbox / Homologação (sandbox.asaas.com)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Chave de API do Asaas (API Key)
                </label>
                <input
                  type="password"
                  required
                  placeholder="$aact_YTU5YTE0M2M6N2ZlYjcyZDI..."
                  value={configApiKeyInput}
                  onChange={(e) => setConfigApiKeyInput(e.target.value)}
                  className="w-full p-2.5 text-xs font-mono border border-neutral-200 rounded-xl text-neutral-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
                <p className="text-[10px] text-neutral-400 mt-1">
                  No Asaas: <strong>Menu &gt; Configurações do Sistema &gt; Integrações &gt; Gerar Chave de API</strong>.
                </p>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setShowConfigModal(false)}
                  className="px-4 py-2 text-xs font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingConfig}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  {isSavingConfig ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                  <span>{isSavingConfig ? 'Salvando...' : 'Salvar e Conectar'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
