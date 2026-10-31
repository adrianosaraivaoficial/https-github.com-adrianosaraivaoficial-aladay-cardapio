import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowRight,
  LogIn,
  QrCode,
  MessageSquare,
  ShieldCheck,
  Check,
  Calculator,
  CreditCard,
  ExternalLink,
  Smartphone,
  Zap,
  Sparkles,
  TrendingUp,
  Building2,
  Store,
  ShoppingBag,
  Send,
  Lock,
  ChevronRight,
  PhoneCall,
  X,
  ChefHat,
  Clock,
  MapPin,
  CheckCircle2,
  HelpCircle,
} from 'lucide-react';
import { AuthSession, RestaurantTenant } from '../types';
import {
  getConsentStatus,
  setConsentStatus,
  trackConversionEvent,
  initGA4,
  ConsentStatus,
} from '../utils/analytics';

interface LandingPageViewProps {
  tenant: RestaurantTenant;
  authSession: AuthSession | null;
  onNavigateToLogin: () => void;
  onNavigateToSetup: () => void;
  onNavigateToDemoMenu: () => void;
  onNavigateToAdmin: () => void;
  onNavigateToTerms?: () => void;
  onNavigateToPrivacy?: () => void;
}

// Sample interactive products for the live mobile phone demonstration
interface DemoProduct {
  id: string;
  name: string;
  category: string;
  priceCents: number;
  description: string;
  badge?: string;
  imageUrl: string;
}

const DEMO_PRODUCTS: DemoProduct[] = [
  {
    id: 'demo_1',
    name: 'Smash Cheddar & Bacon Duplo',
    category: 'Burgers',
    priceCents: 3890,
    description: 'Dois burgers artesanais 100g, queijo cheddar inglês fundido e fatias de bacon crocante.',
    badge: 'Mais Pedido',
    imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&auto=format&fit=crop&q=80',
  },
  {
    id: 'demo_2',
    name: 'Batata Rústica com Alecrim & Queijo',
    category: 'Acompanhamentos',
    priceCents: 2490,
    description: 'Corte rústico artesanal temperado com flor de sal, alecrim fresco e dip cremoso.',
    badge: 'Crocante',
    imageUrl: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=400&auto=format&fit=crop&q=80',
  },
  {
    id: 'demo_3',
    name: 'Pizza Artesanal Margherita D.O.P.',
    category: 'Pizzas',
    priceCents: 6200,
    description: 'Molho de tomate San Marzano, mozzarella di bufala fresca e manjericão no forno a lenha.',
    badge: 'Receita Tradicional',
    imageUrl: 'https://images.unsplash.com/photo-1604382355076-af4b0eb60143?w=400&auto=format&fit=crop&q=80',
  },
  {
    id: 'demo_4',
    name: 'Limonada Suíça com Hortelã 400ml',
    category: 'Bebidas',
    priceCents: 1290,
    description: 'Limões tahiti frescos batidos com leite condensado e folhas de hortelã orgânica.',
    imageUrl: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=400&auto=format&fit=crop&q=80',
  },
];

export const LandingPageView: React.FC<LandingPageViewProps> = ({
  tenant,
  authSession,
  onNavigateToLogin,
  onNavigateToSetup,
  onNavigateToDemoMenu,
  onNavigateToAdmin,
  onNavigateToTerms,
  onNavigateToPrivacy,
}) => {
  // ---------------------------------------------------------------------------
  // 1. Analytics & Privacy Consent State (LGPD / GDPR)
  // ---------------------------------------------------------------------------
  const [cookieConsent, setCookieConsent] = useState<ConsentStatus>('pending');
  const [showConsentModal, setShowConsentModal] = useState<boolean>(false);

  useEffect(() => {
    const status = getConsentStatus();
    setCookieConsent(status);
    if (status === 'granted') {
      initGA4();
    }
    trackConversionEvent('page_view', {
      page_name: 'landing_home',
      tenant_slug: tenant.slug,
    });
  }, [tenant.slug]);

  const handleAcceptAllCookies = () => {
    setConsentStatus('granted');
    setCookieConsent('granted');
    setShowConsentModal(false);
  };

  const handleRejectCookies = () => {
    setConsentStatus('denied');
    setCookieConsent('denied');
    setShowConsentModal(false);
  };

  // ---------------------------------------------------------------------------
  // 2. Mobile Phone Live Menu Demonstration State
  // ---------------------------------------------------------------------------
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  const [demoCart, setDemoCart] = useState<{ product: DemoProduct; count: number }[]>([
    { product: DEMO_PRODUCTS[0], count: 1 },
  ]);
  const [isDemoCartSheetOpen, setIsDemoCartSheetOpen] = useState<boolean>(false);
  const [demoOrderSimulatedPix, setDemoOrderSimulatedPix] = useState<boolean>(false);

  const demoCategories = ['Todos', 'Burgers', 'Pizzas', 'Acompanhamentos', 'Bebidas'];

  const filteredDemoProducts = useMemo(() => {
    if (selectedCategory === 'Todos') return DEMO_PRODUCTS;
    return DEMO_PRODUCTS.filter((p) => p.category === selectedCategory);
  }, [selectedCategory]);

  const demoTotalCents = useMemo(() => {
    return demoCart.reduce((acc, item) => acc + item.product.priceCents * item.count, 0);
  }, [demoCart]);

  const handleAddDemoProduct = (product: DemoProduct) => {
    setDemoCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id ? { ...i, count: i.count + 1 } : i
        );
      }
      return [...prev, { product, count: 1 }];
    });

    trackConversionEvent('interact_phone_demo', {
      action: 'add_item',
      product_name: product.name,
      price_cents: product.priceCents,
    });
  };

  const handleClearDemoCart = () => {
    setDemoCart([]);
    setIsDemoCartSheetOpen(false);
    setDemoOrderSimulatedPix(false);
  };

  // ---------------------------------------------------------------------------
  // 3. Calculator State (Marketplaces vs Aladay R$ 99,00/mês Anual ou R$ 129,90/mês Mensal)
  // ---------------------------------------------------------------------------
  const [monthlyOrders, setMonthlyOrders] = useState<number>(450);
  const [averageTicketBRL, setAverageTicketBRL] = useState<number>(68);
  const [marketplaceFeePercent, setMarketplaceFeePercent] = useState<number>(18);
  const [calculatorPlanCycle, setCalculatorPlanCycle] = useState<'YEARLY' | 'MONTHLY'>('YEARLY');

  const grossMonthlyRevenue = monthlyOrders * averageTicketBRL;
  const marketplaceMonthlyCost = (grossMonthlyRevenue * marketplaceFeePercent) / 100;
  const aladayMonthlyCost = calculatorPlanCycle === 'YEARLY' ? 99.0 : 129.9;
  const monthlySavings = Math.max(0, marketplaceMonthlyCost - aladayMonthlyCost);
  const annualSavings = monthlySavings * 12;

  const formatBRL = (val: number) =>
    val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

  // ---------------------------------------------------------------------------
  // 4. Modal de Proposta Personalizada (Redes & Franquias) & Demonstração Guiada
  // ---------------------------------------------------------------------------
  const [isProposalModalOpen, setIsProposalModalOpen] = useState<boolean>(false);
  const [isGuidedDemoModalOpen, setIsGuidedDemoModalOpen] = useState<boolean>(false);
  const [proposalForm, setProposalForm] = useState({
    name: '',
    restaurantName: '',
    storesCount: '3 a 5 unidades',
    whatsapp: '',
    city: '',
    email: '',
  });
  const [proposalSent, setProposalSent] = useState<boolean>(false);

  const handleSubmitProposal = (e: React.FormEvent) => {
    e.preventDefault();
    trackConversionEvent('request_proposal', {
      stores_count: proposalForm.storesCount,
      city: proposalForm.city,
    });
    setProposalSent(true);
    setTimeout(() => {
      // Direct WhatsApp bridge with pre-filled message
      const text = encodeURIComponent(
        `Olá equipe Aladay! Solicito proposta para o meu grupo gastronômico:\n` +
          `• Nome: ${proposalForm.name}\n` +
          `• Restaurante: ${proposalForm.restaurantName}\n` +
          `• Unidades: ${proposalForm.storesCount}\n` +
          `• Cidade: ${proposalForm.city}\n` +
          `• WhatsApp: ${proposalForm.whatsapp}`
      );
      window.open(`https://wa.me/5511999999999?text=${text}`, '_blank');
      setIsProposalModalOpen(false);
      setProposalSent(false);
    }, 1200);
  };

  // ---------------------------------------------------------------------------
  // Tracked Navigation & Demonstration Handlers
  // ---------------------------------------------------------------------------
  const handleScrollToPhoneDemo = (source: string) => {
    trackConversionEvent('view_demo_interaction', {
      source,
    });
    const target = document.getElementById('demonstracao-celular');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const phoneFrame = document.getElementById('phone-mockup-frame');
      if (phoneFrame) {
        phoneFrame.classList.remove('ring-4', 'ring-blue-500', 'scale-[1.02]');
        void phoneFrame.offsetWidth;
        phoneFrame.classList.add('ring-4', 'ring-blue-500', 'scale-[1.02]', 'transition-all', 'duration-500');
        setTimeout(() => {
          phoneFrame.classList.remove('ring-4', 'ring-blue-500', 'scale-[1.02]');
        }, 2200);
      }
    }
  };

  const handleTrackedSignup = (source: string) => {
    trackConversionEvent('click_signup', {
      source,
      plan: 'pro_129_90',
    });
    onNavigateToSetup();
  };

  const handleTrackedDemo = (source: string) => {
    trackConversionEvent('view_demo_menu', {
      source,
    });
    handleScrollToPhoneDemo(source);
  };

  const handleTrackedLogin = (source: string) => {
    trackConversionEvent('click_login', {
      source,
    });
    onNavigateToLogin();
  };

  const handleTrackedWhatsApp = (source: string) => {
    trackConversionEvent('click_whatsapp_contact', {
      source,
      channel: 'whatsapp_commercial',
    });
    const msg = encodeURIComponent(
      'Olá! Gostaria de tirar dúvidas sobre o Aladay Cardápios Digitais (Plano R$ 99,00/mês Anual ou R$ 129,90/mês e Pix Direto).'
    );
    window.open(`https://wa.me/5511999999999?text=${msg}`, '_blank');
  };

  const aladaySchemaJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Aladay',
    alternateName: 'Aladay Cardápios Digitais',
    description:
      'Software de cardápios digitais para restaurantes, hamburguerias, pizzarias e delivery com pedidos automatizados no WhatsApp via Evolution API, QR Code para mesas e pagamento Pix direto na conta do restaurante sem comissão.',
    url: 'https://aladay.com.br',
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'Software de Cardápios Digitais para Restaurantes',
    operatingSystem: 'Web, Android, iOS',
    inLanguage: 'pt-BR',
    featureList: [
      'Cardápio digital interativo para delivery, retirada e QR Code de mesa',
      'Automação de pedidos e status no WhatsApp via Evolution API',
      'Pagamento Pix dinâmico com repasse 100% direto via Asaas',
      'Importação rápida de produtos e categorias via planilha CSV/Excel',
      'Zero taxa de comissão sobre vendas',
    ],
    offers: [
      {
        '@type': 'Offer',
        name: 'Assinatura Anual Aladay Pro no Cartão de Crédito (12x de R$ 99,00)',
        price: '99.00',
        priceCurrency: 'BRL',
        priceValidUntil: '2027-12-31',
        availability: 'https://schema.org/InStock',
        url: 'https://aladay.com.br',
        category: 'Assinatura Anual SaaS (Cartão de Crédito)',
      },
      {
        '@type': 'Offer',
        name: 'Assinatura Mensal Aladay Pro (com 15 dias de teste grátis)',
        price: '129.90',
        priceCurrency: 'BRL',
        priceValidUntil: '2027-12-31',
        availability: 'https://schema.org/InStock',
        url: 'https://aladay.com.br',
        category: 'Assinatura Mensal SaaS',
      },
    ],
    provider: {
      '@type': 'Organization',
      name: 'Aladay',
      url: 'https://aladay.com.br',
    },
  };

  return (
    <div className="space-y-16 pb-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(aladaySchemaJsonLd) }}
      />
      {/* ================================================================== */}
      {/* 1. MENSAGEM PRINCIPAL & HERO HEADER                                */}
      {/* O que a Aladay faz e exatamente para quem é                         */}
      {/* ================================================================== */}
      <section className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-10 lg:p-14 relative overflow-hidden shadow-xs">
        {/* Decorative subtle technological blue ambient backdrop */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 bg-blue-100/70 rounded-full blur-3xl pointer-events-none opacity-70" />
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 bg-indigo-50/80 rounded-full blur-3xl pointer-events-none opacity-60" />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center relative z-10">
          {/* Left Column: Direct Pitch, Who it is for & CTAs */}
          <div className="lg:col-span-7 space-y-6">
            {/* Tagline Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-200/90 text-blue-700 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
              <span>Plataforma de Pedidos Próprios para Food Service</span>
            </div>

            {/* Main Value Proposition Headline */}
            <h1 className="text-3xl sm:text-4xl lg:text-[44px] font-black tracking-tight text-slate-950 leading-[1.12]">
              O cardápio digital que liberta seu restaurante das comissões abusivas.
            </h1>

            {/* Target Audience Explanation (Para Quem É) */}
            <p className="text-base sm:text-lg text-slate-600 leading-relaxed font-normal">
              A <strong>Aladay</strong> foi criada para <strong>hamburguerias, pizzarias, lanchonetes, restaurantes e dark kitchens</strong> que desejam receber pedidos ilimitados direto no WhatsApp, com <strong>Pix 100% creditado na conta da sua própria loja</strong> e sem intermediários retendo até <strong>27% do seu faturamento</strong>.
            </p>

            {/* Audience Badges */}
            <div className="flex flex-wrap gap-2 pt-1 text-xs text-slate-700 font-medium">
              <span className="px-2.5 py-1 bg-slate-100 rounded-md border border-slate-200">🍔 Hamburguerias</span>
              <span className="px-2.5 py-1 bg-slate-100 rounded-md border border-slate-200">🍕 Pizzarias</span>
              <span className="px-2.5 py-1 bg-slate-100 rounded-md border border-slate-200">🥪 Lanchonetes</span>
              <span className="px-2.5 py-1 bg-slate-100 rounded-md border border-slate-200">🥗 Marmitarias &amp; PF</span>
              <span className="px-2.5 py-1 bg-slate-100 rounded-md border border-slate-200">🍣 Sushi &amp; Asiáticos</span>
              <span className="px-2.5 py-1 bg-slate-100 rounded-md border border-slate-200">🛵 Dark Kitchens &amp; Delivery</span>
            </div>

            {/* Evident Call-to-Action Action Buttons */}
            <div className="pt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => handleTrackedSignup('hero_primary')}
                className="px-6 py-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-all shadow-md shadow-blue-600/20 hover:shadow-lg hover:shadow-blue-600/25 flex items-center gap-2 cursor-pointer"
              >
                <span>Começar Teste Grátis de 15 Dias</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => handleScrollToPhoneDemo('hero_button')}
                className="px-5 py-4 bg-slate-100 hover:bg-slate-200 text-slate-900 text-sm font-semibold rounded-xl transition-colors flex items-center gap-2 cursor-pointer"
              >
                <Smartphone className="w-4 h-4 text-blue-600" />
                <span>Testar Demonstração no Celular</span>
              </button>

              <button
                type="button"
                onClick={() => handleTrackedLogin('hero_login')}
                className="px-4 py-4 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-sm font-medium rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <LogIn className="w-4 h-4 text-slate-500" />
                <span>Fazer Login</span>
              </button>
            </div>

            {/* Trust Metrics Pill Bar */}
            <div className="pt-4 border-t border-slate-200 grid grid-cols-3 gap-4">
              <div>
                <p className="text-xl sm:text-2xl font-black text-slate-950 font-mono">0%</p>
                <p className="text-[11px] sm:text-xs text-slate-500 font-medium">Comissão sobre vendas</p>
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-black text-blue-600 font-mono">100% Direto</p>
                <p className="text-[11px] sm:text-xs text-slate-500 font-medium">Pix na conta da loja</p>
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-black text-slate-950 font-mono">R$ 99,00</p>
                <p className="text-[11px] sm:text-xs text-slate-500 font-medium">/mês no Plano Anual</p>
              </div>
            </div>
          </div>

          {/* ================================================================ */}
          {/* 2. DEMONSTRAÇÃO VISUAL: CARDÁPIO REAL EM TELA DE CELULAR         */}
          {/* ================================================================ */}
          <div id="demonstracao-celular" className="lg:col-span-5 flex flex-col items-center scroll-mt-24">
            <div className="w-full max-w-[360px] relative">
              {/* Floating label guiding user interaction */}
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-30 bg-slate-950 text-white text-[11px] font-semibold px-3 py-1 rounded-full shadow-md flex items-center gap-1.5 whitespace-nowrap border border-slate-800">
                <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                <span>Cardápio Real Interativo no Celular</span>
              </div>

              {/* Realistic Mobile Device Frame */}
              <div id="phone-mockup-frame" className="w-full h-[620px] bg-slate-950 rounded-[44px] p-3 shadow-2xl shadow-slate-950/30 border-4 border-slate-800 relative select-none flex flex-col transition-all duration-300">
                {/* Dynamic Island / Speaker */}
                <div className="w-24 h-5 bg-slate-900 rounded-full mx-auto relative z-30 flex items-center justify-between px-2 text-[8px] text-slate-400 font-mono mb-1 shrink-0">
                  <span className="text-[9px] text-white">19:42</span>
                  <div className="w-2 h-2 rounded-full bg-slate-700" />
                  <span className="text-[9px] text-sky-400">5G</span>
                </div>

                {/* Inner Screen Surface */}
                <div className="rounded-[32px] overflow-hidden bg-slate-50 h-full flex flex-col relative border border-slate-200">
                  {/* Phone Header Banner */}
                  <div className="bg-slate-950 text-white p-3.5 shrink-0 relative">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 pb-1">
                      <span className="flex items-center gap-1 text-sky-400 font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
                        Aberto Agora
                      </span>
                      <span className="font-mono text-[10px]">30-45 min</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-xs shadow-blue-600/30">
                        {tenant.name.slice(0, 2).toUpperCase() || 'AL'}
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-xs font-bold text-white truncate">
                          {tenant.name || 'Aladay Smash & Burger'}
                        </h2>
                        <p className="text-[10px] text-slate-400 truncate flex items-center gap-1">
                          <MapPin className="w-2.5 h-2.5" />
                          <span>Delivery &amp; Balcão &middot; Pix Direto</span>
                        </p>
                      </div>
                    </div>

                    {/* Notice bar inside phone */}
                    <div className="mt-2 py-1 px-2 rounded-md bg-slate-900 border border-slate-800 text-[9px] text-sky-300 flex items-center justify-between">
                      <span>⚡ Chave Pix da loja &middot; Sem taxas</span>
                      <span className="font-mono text-white font-semibold">0% taxa</span>
                    </div>
                  </div>

                  {/* Horizontal Category Switcher */}
                  <div className="bg-white border-b border-slate-200 px-2 py-1.5 flex gap-1.5 overflow-x-auto no-scrollbar shrink-0 text-[11px]">
                    {demoCategories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedCategory(cat)}
                        className={`px-2.5 py-1 rounded-full whitespace-nowrap font-semibold transition-colors cursor-pointer ${
                          selectedCategory === cat
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  {/* Scrollable Products List */}
                  <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
                    {filteredDemoProducts.map((prod) => (
                      <div
                        key={prod.id}
                        className="bg-white rounded-xl p-2 border border-slate-200 shadow-2xs flex gap-2.5 items-center hover:border-blue-500 transition-colors"
                      >
                        <img
                          src={prod.imageUrl}
                          alt={prod.name}
                          className="w-16 h-16 rounded-lg object-cover shrink-0 bg-slate-100"
                          loading="lazy"
                        />
                        <div className="flex-1 min-w-0">
                          {prod.badge && (
                            <span className="text-[9px] font-semibold text-blue-700 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded">
                              {prod.badge}
                            </span>
                          )}
                          <h3 className="text-xs font-bold text-slate-900 truncate">
                            {prod.name}
                          </h3>
                          <p className="text-[10px] text-slate-500 line-clamp-1 leading-tight">
                            {prod.description}
                          </p>
                          <div className="mt-1 flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-950 font-mono">
                              R$ {(prod.priceCents / 100).toFixed(2).replace('.', ',')}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleAddDemoProduct(prod)}
                              className="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-semibold rounded-md transition-colors cursor-pointer"
                            >
                              + Adicionar
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}

                    <div className="p-2 text-center text-[10px] text-slate-400">
                      Toque em <strong>+ Adicionar</strong> para simular o pedido
                    </div>
                  </div>

                  {/* Interactive Cart Bottom Bar inside Phone */}
                  <div className="p-2 bg-white border-t border-slate-200 shrink-0">
                    {demoCart.length > 0 ? (
                      <div className="space-y-1.5">
                        <button
                          type="button"
                          onClick={() => setIsDemoCartSheetOpen(!isDemoCartSheetOpen)}
                          className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer shadow-xs shadow-blue-600/20"
                        >
                          <div className="flex items-center gap-1.5">
                            <ShoppingBag className="w-3.5 h-3.5" />
                            <span>
                              {demoCart.reduce((sum, i) => sum + i.count, 0)} {demoCart.length === 1 ? 'item' : 'itens'}
                            </span>
                          </div>
                          <span>R$ {(demoTotalCents / 100).toFixed(2).replace('.', ',')} &middot; Ver Sacola</span>
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleAddDemoProduct(DEMO_PRODUCTS[0])}
                        className="w-full py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-medium flex items-center justify-center gap-1 transition-colors cursor-pointer"
                      >
                        <span>Sacola vazia &middot; Adicione um item</span>
                      </button>
                    )}
                  </div>

                  {/* Simulated Drawer / Pix Sheet inside Phone */}
                  {isDemoCartSheetOpen && (
                    <div className="absolute inset-0 bg-slate-950/60 z-40 flex flex-col justify-end">
                      <div className="bg-white rounded-t-2xl p-3 space-y-2 border-t border-slate-200 max-h-[75%] overflow-y-auto">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                          <span className="text-xs font-bold text-slate-900">
                            Sacola do Cliente (Simulação)
                          </span>
                          <button
                            type="button"
                            onClick={() => setIsDemoCartSheetOpen(false)}
                            className="text-slate-400 hover:text-slate-700 text-xs p-1"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="space-y-1.5 text-xs">
                          {demoCart.map((item) => (
                            <div key={item.product.id} className="flex justify-between items-center text-[11px]">
                              <span className="truncate pr-2">
                                {item.count}x {item.product.name}
                              </span>
                              <span className="font-mono font-semibold shrink-0">
                                R$ {((item.product.priceCents * item.count) / 100).toFixed(2).replace('.', ',')}
                              </span>
                            </div>
                          ))}
                        </div>

                        <div className="pt-2 border-t border-slate-200 flex justify-between font-bold text-xs">
                          <span>Total do Pedido:</span>
                          <span className="font-mono text-blue-600">
                            R$ {(demoTotalCents / 100).toFixed(2).replace('.', ',')}
                          </span>
                        </div>

                        {!demoOrderSimulatedPix ? (
                          <button
                            type="button"
                            onClick={() => {
                              setDemoOrderSimulatedPix(true);
                              trackConversionEvent('interact_phone_demo', { action: 'simulate_pix_checkout' });
                            }}
                            className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1"
                          >
                            <QrCode className="w-3.5 h-3.5" />
                            <span>Pagar com Pix Direto (0% taxa)</span>
                          </button>
                        ) : (
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 text-[10px] space-y-1 text-blue-950">
                            <div className="flex items-center gap-1 font-bold text-blue-800">
                              <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                              <span>QR Code Pix Gerado na Hora</span>
                            </div>
                            <p className="text-slate-600">
                              O dinheiro entra 100% no banco da loja. A cozinha recebe a comanda e o cliente é avisado no WhatsApp.
                            </p>
                            <button
                              type="button"
                              onClick={handleClearDemoCart}
                              className="mt-1 w-full text-center text-blue-600 font-semibold underline"
                            >
                              Reiniciar Demonstração
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Sub-phone CTA button */}
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => {
                    trackConversionEvent('open_guided_demo_modal', { source: 'phone_footer' });
                    setIsGuidedDemoModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-800 hover:text-blue-600 transition-colors cursor-pointer border border-slate-200"
                >
                  <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                  <span>Ver Tour da Operação (Cardápio + KDS + WhatsApp)</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* 3. ARQUITETURA OPERACIONAL: POR QUE O MODELO ALADAY FUNCIONA       */}
      {/* ================================================================== */}
      <section className="space-y-8">
        <div className="max-w-3xl space-y-2">
          <p className="text-xs font-bold text-blue-600 uppercase tracking-wider">
            01. Pilares da Operação
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-950 tracking-tight">
            Como a Aladay transforma o WhatsApp da sua loja em lucro real
          </h2>
          <p className="text-sm text-slate-600">
            Eliminamos os intermediários para que você tenha controle dos seus clientes, margens saudáveis e agilidade máxima de ponta a ponta.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Pix Direto */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 flex flex-col justify-between hover:border-blue-300 transition-colors shadow-2xs">
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center">
                <QrCode className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-950">
                1. Pix 100% Direto na Conta da Loja
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Você cadastra a chave Pix do seu próprio banco (Nubank PJ, Inter, Itaú, Bradesco, etc.). O QR Code e código Copia e Cola são gerados instantaneamente com padrão BACEN EMV. <strong>A Aladay não retém R$ 0,01 das suas vendas.</strong>
              </p>
            </div>
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-mono">
              <span>Zero Retenção</span>
              <span className="text-blue-600 font-bold">Liquidação Imediata</span>
            </div>
          </div>

          {/* Card 2: KDS & WhatsApp Automático */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 flex flex-col justify-between hover:border-blue-300 transition-colors shadow-2xs">
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center">
                <MessageSquare className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-950">
                2. KDS &amp; WhatsApp Automático
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                O cliente acompanha cada etapa sem sobrecarregar sua equipe: quando o pedido é confirmado, entra em preparo ou sai para entrega com o motoboy, o WhatsApp dele recebe avisos automáticos via Evolution API.
              </p>
            </div>
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-mono">
              <span>-80% Mensagens</span>
              <span className="text-blue-600 font-bold">Fim do &ldquo;Cadê meu pedido?&rdquo;</span>
            </div>
          </div>

          {/* Card 3: Cardápio Próprio Sem Instalação */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 flex flex-col justify-between hover:border-blue-300 transition-colors shadow-2xs">
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center">
                <Smartphone className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-950">
                3. Sem Download &amp; Sem Login Chato
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                O cliente acessa pelo link na bio do Instagram ou pelo QR Code da mesa sem precisar baixar nenhum aplicativo da App Store. Carregamento instantâneo via Cloudflare com experiência moderna e intuitiva.
              </p>
            </div>
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-mono">
              <span>aladay.com.br</span>
              <span className="text-blue-600 font-bold">100% Responsivo</span>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* 4. OFERTA: PLANOS, PREÇOS E COMO SOLICITAR PROPOSTA                */}
      {/* ================================================================== */}
      <section id="planos" className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-10 lg:p-12 space-y-10 shadow-xs scroll-mt-24">
        <div className="max-w-3xl space-y-2">
          <p className="text-xs font-bold text-blue-600 uppercase tracking-wider">
            02. Modelo Comercial &amp; Planos
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-950 tracking-tight">
            Transparência absoluta: quanto custa usar a Aladay?
          </h2>
          <p className="text-sm text-slate-600">
            Você paga apenas uma assinatura mensal fixa para a infraestrutura da plataforma. Venda 50 ou 5.000 pedidos, o valor do seu plano não se altera.
          </p>
        </div>

        {/* Pricing Cards Grid: Anual R$ 99,00/mês (Cartão) & Mensal R$ 129,90/mês */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Card 1 (Featured): Assinatura Anual R$ 99,00/mês no Cartão de Crédito */}
          <div className="lg:col-span-6 bg-slate-950 text-white rounded-2xl p-6 sm:p-7 flex flex-col justify-between border-2 border-blue-500 relative shadow-xl">
            <div className="absolute -top-3.5 right-5 bg-blue-600 text-white text-[11px] font-extrabold px-3 py-1 rounded-full shadow-md flex items-center gap-1">
              <CreditCard className="w-3.5 h-3.5" />
              <span>MAIS VANTAJOSO &middot; ECONOMIZE R$ 370,80/ANO</span>
            </div>

            <div className="space-y-5">
              <div>
                <span className="text-xs font-semibold text-sky-400 uppercase tracking-wider">
                  Assinatura Anual &middot; Exclusivo no Cartão de Crédito
                </span>
                <h3 className="text-2xl font-black text-white mt-1">Plano Aladay Anual</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Garanta o menor valor mensal contratando o ciclo anual parcelado em 12x no cartão de crédito.
                </p>
              </div>

              {/* Price display */}
              <div className="border-y border-slate-800 py-4 space-y-2">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-4xl sm:text-5xl font-black font-mono text-white">R$ 99,00</span>
                  <span className="text-slate-300 text-sm font-semibold">/mês</span>
                  <span className="ml-auto text-[11px] font-mono text-sky-400 bg-slate-900 px-2.5 py-1 rounded-md border border-slate-800">
                    24% de desconto
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span className="flex items-center gap-1.5 text-sky-300 font-semibold">
                    <CreditCard className="w-3.5 h-3.5 text-sky-400" />
                    <span>No Cartão de Crédito (12x de R$ 99,00)</span>
                  </span>
                  <span className="line-through text-slate-500">De R$ 129,90/mês</span>
                </div>
              </div>

              {/* What is included checklist */}
              <div className="space-y-2.5 text-xs text-slate-300">
                <div className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                  <span><strong>Pagamento exclusivo no Cartão de Crédito</strong> (12x R$ 99,00)</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                  <span>Cardápio digital ilimitado (Link &amp; QR Code de Mesa)</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                  <span>Pix dos pedidos 100% direto na conta bancária da loja (0% comissão)</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                  <span>Disparos automáticos no WhatsApp via Evolution API</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                  <span>Painel KDS com contador visual SLA &amp; impressão térmica</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                  <span>Inclui 15 dias de teste grátis para experimentar tudo</span>
                </div>
              </div>
            </div>

            {/* CTA inside Annual Card */}
            <div className="pt-6 mt-6 border-t border-slate-800 space-y-2">
              <button
                type="button"
                onClick={() => handleTrackedSignup('pricing_annual_99_cc')}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs sm:text-sm rounded-xl transition-all shadow-md shadow-blue-600/25 flex items-center justify-center gap-2 cursor-pointer"
              >
                <CreditCard className="w-4 h-4" />
                <span>Assinar Anual por R$ 99,00/mês no Cartão</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <p className="text-[11px] text-slate-400 text-center">
                12x de R$ 99,00 no cartão de crédito (total R$ 1.188,00/ano) &middot; Economia de R$ 370,80.
              </p>
            </div>
          </div>

          {/* Card 2: Assinatura Mensal R$ 129,90/mês */}
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl p-6 sm:p-7 flex flex-col justify-between shadow-xs">
            <div className="space-y-5">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-blue-600 uppercase tracking-wider">
                    Assinatura Mensal Flexível
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                    15 Dias Grátis
                  </span>
                </div>
                <h3 className="text-xl font-black text-slate-950 mt-1">Plano Aladay Mensal</h3>
                <p className="text-xs text-slate-600 mt-1">
                  Sem fidelidade anual. Pague mês a mês via Pix, Cartão de Crédito ou Boleto Asaas.
                </p>
              </div>

              {/* Price display */}
              <div className="border-y border-slate-200 py-4 space-y-1.5">
                <div className="flex flex-wrap items-baseline gap-1.5">
                  <span className="text-3xl sm:text-4xl font-black font-mono text-slate-950">R$ 129,90</span>
                  <span className="text-slate-500 text-xs font-medium">/mês</span>
                </div>
                <p className="text-[11px] font-mono text-blue-600 font-semibold">
                  Pix, Cartão de Crédito ou Boleto &middot; 0% comissão
                </p>
              </div>

              <div className="space-y-2.5 text-xs text-slate-700">
                <div className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <span>Todos os recursos do Plano Pro liberados</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <span>Pix 100% direto na conta bancária da sua loja</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <span>Pedidos, produtos e categorias ilimitados</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <span>KDS Cozinha + WhatsApp Automático Evolution API</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <span>Sem fidelidade: cancele quando quiser sem multa</span>
                </div>
              </div>
            </div>

            <div className="pt-6 mt-6 border-t border-slate-200 space-y-2">
              <button
                type="button"
                onClick={() => handleTrackedSignup('pricing_monthly_129_90')}
                className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Começar 15 Dias Grátis (Plano Mensal)</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <p className="text-[11px] text-slate-500 text-center">
                R$ 0,00 hoje &middot; Após 15 dias, R$ 129,90/mês via Asaas.
              </p>
            </div>
          </div>
        </div>

        {/* Comparison Table vs Marketplaces */}
        <div className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-50/50">
          <div className="p-4 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
              Comparativo de Custos &middot; Apps Tradicionais vs Aladay
            </h4>
            <span className="text-[11px] text-blue-600 font-mono font-semibold">Economia Real</span>
          </div>
          <div className="overflow-x-auto text-xs">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-white">
                  <th className="py-3 px-4 font-semibold text-slate-700">Recurso / Custo</th>
                  <th className="py-3 px-4 font-semibold text-slate-500">Apps Tradicionais (Marketplaces)</th>
                  <th className="py-3 px-4 font-bold text-blue-800 bg-blue-50/60">Aladay Cardápios Digitais</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                <tr>
                  <td className="py-3 px-4 font-medium text-slate-900">Comissão por Pedido</td>
                  <td className="py-3 px-4 text-rose-600 font-semibold">12% a 27% sobre cada venda</td>
                  <td className="py-3 px-4 font-bold text-blue-700 bg-blue-50/60">0% (Zero comissão)</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-medium text-slate-900">Prazo de Repasse do Dinheiro</td>
                  <td className="py-3 px-4 text-slate-600">Até 30 dias (ou taxa extra de antecipação)</td>
                  <td className="py-3 px-4 font-bold text-blue-700 bg-blue-50/60">Na hora (Pix direto no seu banco)</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-medium text-slate-900">Acesso à Base de Clientes</td>
                  <td className="py-3 px-4 text-slate-600">O cliente pertence ao aplicativo</td>
                  <td className="py-3 px-4 font-bold text-blue-700 bg-blue-50/60">Sua base própria de WhatsApp</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-medium text-slate-900">Notificações no WhatsApp</td>
                  <td className="py-3 px-4 text-slate-600">Não disponível</td>
                  <td className="py-3 px-4 font-bold text-blue-700 bg-blue-50/60">100% automáticas via Evolution API</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-medium text-slate-900">Custo Total Mensal</td>
                  <td className="py-3 px-4 text-slate-600">R$ 2.000 a R$ 8.000+ em comissões</td>
                  <td className="py-3 px-4 font-bold text-blue-700 bg-blue-50/60">R$ 99,00/mês (Anual no Cartão) ou R$ 129,90/mês (Mensal)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* 5. SIMULADOR DE ECONOMIA (CALCULADORA DE ROI INTERATIVA)            */}
      {/* ================================================================== */}
      <section id="calculadora" className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-10 space-y-8 shadow-xs scroll-mt-24">
        <div className="max-w-3xl space-y-2">
          <p className="text-xs font-bold text-blue-600 uppercase tracking-wider">
            03. Calculadora de Economia
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-950 tracking-tight">
            Calcule quanto você economiza ao substituir comissões pela assinatura fixa
          </h2>
          <p className="text-sm text-slate-600">
            Arraste os seletores para aproximar com os números do seu restaurante hoje.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Sliders */}
          <div className="lg:col-span-7 space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-medium">
                <label htmlFor="slider-orders" className="text-slate-700">
                  Volume de pedidos por mês
                </label>
                <span className="font-mono font-bold text-slate-950">
                  {monthlyOrders} pedidos/mês
                </span>
              </div>
              <input
                id="slider-orders"
                type="range"
                min={50}
                max={2000}
                step={25}
                value={monthlyOrders}
                onChange={(e) => {
                  setMonthlyOrders(Number(e.target.value));
                  trackConversionEvent('calculate_roi', {
                    orders: Number(e.target.value),
                    savings: monthlySavings,
                  });
                }}
                className="w-full accent-blue-600 cursor-pointer"
              />
              <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                <span>50 pedidos</span>
                <span>1.000 pedidos</span>
                <span>2.000 pedidos</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs font-medium">
                <label htmlFor="slider-ticket" className="text-slate-700">
                  Ticket Médio por Pedido (R$)
                </label>
                <span className="font-mono font-bold text-slate-950">
                  R$ {averageTicketBRL},00
                </span>
              </div>
              <input
                id="slider-ticket"
                type="range"
                min={25}
                max={180}
                step={5}
                value={averageTicketBRL}
                onChange={(e) => {
                  setAverageTicketBRL(Number(e.target.value));
                  trackConversionEvent('calculate_roi', {
                    ticket: Number(e.target.value),
                    savings: monthlySavings,
                  });
                }}
                className="w-full accent-blue-600 cursor-pointer"
              />
              <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                <span>R$ 25</span>
                <span>R$ 90</span>
                <span>R$ 180</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs font-medium">
                <label htmlFor="slider-fee" className="text-slate-700">
                  Comissão cobrada pelo Marketplace (%)
                </label>
                <span className="font-mono font-bold text-slate-950">
                  {marketplaceFeePercent}%
                </span>
              </div>
              <input
                id="slider-fee"
                type="range"
                min={12}
                max={27}
                step={1}
                value={marketplaceFeePercent}
                onChange={(e) => setMarketplaceFeePercent(Number(e.target.value))}
                className="w-full accent-blue-600 cursor-pointer"
              />
              <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                <span>12% (Básico)</span>
                <span>18% (Média)</span>
                <span>27% (Com Entrega do App)</span>
              </div>
            </div>
          </div>

          {/* Result Card */}
          <div className="lg:col-span-5 bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-4">
            {/* Plan cycle toggle inside calculator */}
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-200/80 rounded-xl text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => setCalculatorPlanCycle('YEARLY')}
                className={`py-1.5 px-2 rounded-lg transition-all cursor-pointer ${
                  calculatorPlanCycle === 'YEARLY'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Anual (R$ 99,00/mês Cartão)
              </button>
              <button
                type="button"
                onClick={() => setCalculatorPlanCycle('MONTHLY')}
                className={`py-1.5 px-2 rounded-lg transition-all cursor-pointer ${
                  calculatorPlanCycle === 'MONTHLY'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Mensal (R$ 129,90/mês)
              </button>
            </div>

            <div className="space-y-2.5 border-b border-slate-200 pb-4 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-600">Faturamento Bruto:</span>
                <span className="font-mono font-semibold text-slate-900">
                  {formatBRL(grossMonthlyRevenue)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Comissão Retida no App ({marketplaceFeePercent}%):</span>
                <span className="font-mono font-semibold text-rose-600">
                  - {formatBRL(marketplaceMonthlyCost)} / mês
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">
                  Assinatura Fixa Aladay ({calculatorPlanCycle === 'YEARLY' ? 'Anual no Cartão' : 'Mensal'}):
                </span>
                <span className="font-mono font-semibold text-blue-600">
                  {calculatorPlanCycle === 'YEARLY' ? 'R$ 99,00 / mês' : 'R$ 129,90 / mês'}
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-slate-500 font-medium">
                Lucro Extra que fica no seu bolso todo mês:
              </p>
              <p className="text-3xl font-black text-blue-600 font-mono">
                {formatBRL(monthlySavings)} / mês
              </p>
              <p className="text-xs font-mono text-slate-600">
                Ou seja, <strong>{formatBRL(annualSavings)} a mais por ano</strong> para investir no seu negócio.
              </p>
            </div>

            <button
              type="button"
              onClick={() => handleTrackedSignup('calculator_result_cta')}
              className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs shadow-blue-600/20"
            >
              <Calculator className="w-4 h-4" />
              <span>Quero Economizar {formatBRL(monthlySavings)}/mês</span>
            </button>
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* 6. CAMINHO EVIDENTE: BANNER FINAL DE CONVERSÃO & CONTATO           */}
      {/* ================================================================== */}
      <section className="bg-slate-950 text-white rounded-3xl p-8 sm:p-12 text-center relative overflow-hidden shadow-xl border border-slate-800">
        <div className="max-w-2xl mx-auto space-y-6 relative z-10">
          <span className="inline-block px-3 py-1 bg-blue-950/90 border border-blue-800 text-sky-400 text-xs font-semibold rounded-full">
            Teste Grátis por 15 Dias &middot; Sem Compromisso
          </span>
          <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
            Coloque seu cardápio próprio no ar hoje mesmo com 15 dias grátis.
          </h2>
          <p className="text-sm sm:text-base text-slate-400 max-w-xl mx-auto leading-relaxed">
            Cadastre seu período de teste grátis de 15 dias em menos de 1 minuto, configure seus produtos e comece a receber pedidos no WhatsApp com Pix 100% na sua conta bancária.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => handleTrackedSignup('bottom_banner_primary')}
              className="px-7 py-4 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl transition-all shadow-md shadow-blue-600/25 flex items-center gap-2 cursor-pointer"
            >
              <span>Começar 15 Dias de Teste Grátis</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => handleScrollToPhoneDemo('bottom_banner_demo')}
              className="px-6 py-4 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-xl border border-slate-800 transition-colors flex items-center gap-2 cursor-pointer shadow-xs"
            >
              <Smartphone className="w-4 h-4 text-sky-400" />
              <span>Testar Demonstração no Celular</span>
            </button>

            <button
              type="button"
              onClick={() => handleTrackedWhatsApp('bottom_banner_whatsapp')}
              className="px-5 py-4 bg-slate-900 hover:bg-slate-800 text-slate-300 text-sm font-medium rounded-xl border border-slate-800 transition-colors flex items-center gap-2 cursor-pointer"
            >
              <PhoneCall className="w-4 h-4 text-sky-400" />
              <span>Tirar Dúvidas no WhatsApp</span>
            </button>
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* 7. MODAL DE SOLICITAÇÃO DE PROPOSTA (REDES & FRANQUIAS)           */}
      {/* ================================================================== */}
      {isProposalModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 sm:p-8 space-y-5 shadow-2xl border border-slate-200 relative animate-in fade-in duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-950">
                  Solicitar Proposta para Redes &amp; Franquias
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Preencha os dados da sua operação para receber contato personalizado.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsProposalModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {proposalSent ? (
              <div className="p-6 text-center space-y-3 bg-blue-50 rounded-xl border border-blue-200 text-blue-950">
                <CheckCircle2 className="w-10 h-10 text-blue-600 mx-auto" />
                <h4 className="font-bold text-sm">Solicitação Recebida com Sucesso!</h4>
                <p className="text-xs text-slate-600">
                  Redirecionando para o canal direto do WhatsApp para envio da sua proposta comercial...
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmitProposal} className="space-y-4 text-xs">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Seu Nome Completo *
                  </label>
                  <input
                    type="text"
                    required
                    value={proposalForm.name}
                    onChange={(e) => setProposalForm({ ...proposalForm, name: e.target.value })}
                    placeholder="Ex: Carlos Eduardo Mendes"
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 focus:outline-blue-600 text-slate-900"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Nome do Restaurante / Marca *
                    </label>
                    <input
                      type="text"
                      required
                      value={proposalForm.restaurantName}
                      onChange={(e) => setProposalForm({ ...proposalForm, restaurantName: e.target.value })}
                      placeholder="Ex: Smash Bros Burger"
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-300 focus:outline-blue-600 text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Número de Unidades *
                    </label>
                    <select
                      value={proposalForm.storesCount}
                      onChange={(e) => setProposalForm({ ...proposalForm, storesCount: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-300 focus:outline-blue-600 text-slate-900 bg-white"
                    >
                      <option value="2 a 3 lojas">2 a 3 lojas</option>
                      <option value="4 a 8 lojas">4 a 8 lojas</option>
                      <option value="9 a 20 lojas">9 a 20 lojas</option>
                      <option value="Mais de 20 lojas (Franquia)">Mais de 20 lojas (Franquia)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      WhatsApp Comercial *
                    </label>
                    <input
                      type="tel"
                      required
                      value={proposalForm.whatsapp}
                      onChange={(e) => setProposalForm({ ...proposalForm, whatsapp: e.target.value })}
                      placeholder="(11) 99999-9999"
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-300 focus:outline-blue-600 text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Cidade e Estado *
                    </label>
                    <input
                      type="text"
                      required
                      value={proposalForm.city}
                      onChange={(e) => setProposalForm({ ...proposalForm, city: e.target.value })}
                      placeholder="São Paulo, SP"
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-300 focus:outline-blue-600 text-slate-900"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    E-mail Corporativo (Opcional)
                  </label>
                  <input
                    type="email"
                    value={proposalForm.email}
                    onChange={(e) => setProposalForm({ ...proposalForm, email: e.target.value })}
                    placeholder="contato@restaurante.com.br"
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 focus:outline-blue-600 text-slate-900"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Send className="w-4 h-4" />
                    <span>Enviar Solicitação de Proposta</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* 8. MODAL DE DEMONSTRAÇÃO COMPLETA DA OPERAÇÃO ALADAY             */}
      {/* ================================================================== */}
      {isGuidedDemoModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 space-y-6 shadow-2xl border border-slate-200 relative animate-in fade-in duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div>
                <span className="text-xs font-semibold text-blue-600 uppercase tracking-wider">
                  Tour Operacional Aladay
                </span>
                <h3 className="text-xl font-black text-slate-950 mt-0.5">
                  Como Funciona do Pedido à Entrega
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsGuidedDemoModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 3 Step Interactive Visual Cards */}
            <div className="space-y-4">
              {/* Step 1 */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-900 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">1</span>
                    Cliente Acessa o Cardápio no Celular
                  </span>
                  <span className="text-blue-600 font-mono font-semibold">Sem App &middot; 100% Web</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed pl-8">
                  O cliente clica no link da sua bio do Instagram ou escaneia o QR Code na mesa. Navega pelas categorias, seleciona adicionais e opções com fotos reais e fecha o pedido em segundos.
                </p>
              </div>

              {/* Step 2 */}
              <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-blue-950 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-blue-700 text-white flex items-center justify-center text-xs font-bold">2</span>
                    Pix 100% Direto na Conta do seu Banco
                  </span>
                  <span className="text-blue-700 font-mono font-bold">0% Comissão Retida</span>
                </div>
                <p className="text-xs text-slate-700 leading-relaxed pl-8">
                  O QR Code e o código Pix Copia e Cola são gerados instantaneamente com a chave Pix cadastrada pelo seu restaurante. O dinheiro entra na hora na sua conta bancária PJ.
                </p>
              </div>

              {/* Step 3 */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-900 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold">3</span>
                    Cozinha KDS &amp; WhatsApp Automático
                  </span>
                  <span className="text-slate-500 font-mono">Evolution API</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed pl-8">
                  A cozinha visualiza o pedido no painel Kanban. Quando avança para &ldquo;Em Preparo&rdquo; ou &ldquo;Saiu para Entrega&rdquo;, o cliente recebe atualizações em tempo real pelo WhatsApp com link de rastreio.
                </p>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsGuidedDemoModalOpen(false);
                  handleScrollToPhoneDemo('modal_demo_cta');
                }}
                className="flex-1 py-3.5 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <Smartphone className="w-4 h-4 text-sky-400" />
                <span>Testar Cardápio no Celular Interativo</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsGuidedDemoModalOpen(false);
                  handleTrackedSignup('modal_signup_cta');
                }}
                className="flex-1 py-3.5 px-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              >
                <span>Criar Meu Cardápio (A partir de R$ 99/mês)</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* 9. PRIVACY & LGPD COOKIE CONSENT BANNER (MEDIÇÃO COM PRIVACIDADE)   */}
      {/* ================================================================== */}
      {cookieConsent === 'pending' && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-50 bg-white border border-slate-300 rounded-2xl p-5 shadow-2xl text-xs space-y-3">
          <div className="flex items-start gap-2.5">
            <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-slate-950">Privacidade &amp; Métricas (LGPD)</p>
              <p className="text-slate-600 leading-relaxed text-[11px]">
                Utilizamos cookies essenciais para o funcionamento do site e, com seu consentimento, métricas de navegação anônimas via Google Analytics 4 para aprimorar o serviço. Consulte nossos{' '}
                {onNavigateToTerms && (
                  <button
                    type="button"
                    onClick={onNavigateToTerms}
                    className="underline font-semibold text-slate-900 hover:text-blue-600 cursor-pointer"
                  >
                    Termos de Uso
                  </button>
                )}{' '}
                e{' '}
                {onNavigateToPrivacy && (
                  <button
                    type="button"
                    onClick={onNavigateToPrivacy}
                    className="underline font-semibold text-slate-900 hover:text-blue-600 cursor-pointer"
                  >
                    Política de Privacidade
                  </button>
                )}
                .
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleAcceptAllCookies}
              className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-xs transition-colors cursor-pointer text-center"
            >
              Aceitar Métricas
            </button>
            <button
              type="button"
              onClick={handleRejectCookies}
              className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg text-xs transition-colors cursor-pointer"
            >
              Apenas Essenciais
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
