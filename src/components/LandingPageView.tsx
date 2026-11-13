import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  ChevronDown,
  PhoneCall,
  X,
  ChefHat,
  Clock,
  MapPin,
  CheckCircle2,
  HelpCircle,
  Utensils,
  Bike,
  Users,
  Plus,
  Minus,
  ArrowLeft,
  Play,
  Pause,
  Volume2,
  VolumeX,
  RotateCcw,
  Maximize2,
  Layers,
  FileSpreadsheet,
  Printer,
  SmartphoneCharging,
  DollarSign,
  HeartHandshake,
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
    imageUrl: '/src/assets/images/hero_food_burger_1794421911219.jpg',
  },
  {
    id: 'demo_2',
    name: 'Batata Rústica com Alecrim & Queijo',
    category: 'Acompanhamentos',
    priceCents: 2490,
    description: 'Corte rústico artesanal temperado com flor de sal, alecrim fresco e dip cremoso.',
    badge: 'Crocante',
    imageUrl: '/src/assets/images/hero_food_burger_1794421911219.jpg',
  },
  {
    id: 'demo_3',
    name: 'Pizza Artesanal Margherita D.O.P.',
    category: 'Pizzas',
    priceCents: 6200,
    description: 'Molho de tomate San Marzano, mozzarella di bufala fresca e manjericão no forno a lenha.',
    badge: 'Forno a Lenha',
    imageUrl: '/src/assets/images/reel_thumb_order_1794421913435.jpg',
  },
  {
    id: 'demo_4',
    name: 'Limonada Suíça com Hortelã 400ml',
    category: 'Bebidas',
    priceCents: 1290,
    description: 'Limões tahiti frescos batidos com leite condensado e folhas de hortelã orgânica.',
    imageUrl: '/src/assets/images/hero_restaurant_table_1794421912692.jpg',
  },
];

interface ReelItem {
  id: string;
  title: string;
  subtitle: string;
  duration: string;
  category: string;
  thumbnailUrl: string;
  accentColor: string;
  storySteps: {
    heading: string;
    description: string;
    badge: string;
  }[];
}

const REELS_DATA: ReelItem[] = [
  {
    id: 'reel_cardapio',
    title: 'Como funciona o cardápio digital',
    subtitle: 'Navegação instantânea sem precisar baixar nenhum aplicativo.',
    duration: '0:45',
    category: 'Cliente',
    thumbnailUrl: '/src/assets/images/reel_thumb_menu_1794421912943.jpg',
    accentColor: 'from-blue-600/90 to-indigo-900/90',
    storySteps: [
      {
        heading: '1. Acesso Imediato no Celular',
        description: 'O cliente clica no link da sua bio do Instagram ou escaneia o QR Code na mesa. O menu carrega em menos de 1 segundo.',
        badge: 'Zero Instalação',
      },
      {
        heading: '2. Fotos em Alta Definição',
        description: 'Apresentação visual com fotos apetitosas dos pratos, destaques para os mais vendidos e variações bem organizadas.',
        badge: 'Cardápio Visual',
      },
      {
        heading: '3. Adicionais & Observações',
        description: 'O cliente escolhe o ponto da carne, adiciona queijo extra ou escreve observações sem complicação.',
        badge: 'Customização Fácil',
      },
    ],
  },
  {
    id: 'reel_pedido',
    title: 'Como o cliente faz um pedido',
    subtitle: 'Fluxo em 2 etapas otimizado para celulares rápidos.',
    duration: '0:50',
    category: 'Vendas',
    thumbnailUrl: '/src/assets/images/hero_food_burger_1794421911219.jpg',
    accentColor: 'from-amber-600/90 to-orange-950/90',
    storySteps: [
      {
        heading: '1. Revisão Rápida na Sacola',
        description: 'O cliente confere os itens, ajusta quantidades e visualiza o subtotal de forma transparente.',
        badge: 'Etapa 1',
      },
      {
        heading: '2. Dados de Entrega ou Retirada',
        description: 'Preenchimento direto de nome, WhatsApp e endereço com cálculo automático de taxa de entrega.',
        badge: 'Etapa 2',
      },
      {
        heading: '3. Pix Direto & Envio Instantâneo',
        description: 'O Pix entra na hora na conta do restaurante e o pedido cai direto no WhatsApp e na tela da cozinha.',
        badge: 'Conclusão Segura',
      },
    ],
  },
  {
    id: 'reel_qr',
    title: 'Como funciona o QR Code de mesa',
    subtitle: 'Atendimento no salão com comanda digital por mesa.',
    duration: '0:40',
    category: 'Salão',
    thumbnailUrl: '/src/assets/images/reel_thumb_qr_1794421914081.jpg',
    accentColor: 'from-emerald-600/90 to-teal-950/90',
    storySteps: [
      {
        heading: '1. QR Code Único por Mesa',
        description: 'Cada mesa possui sua identificação. O cliente escaneia com a câmera do celular sem chamar garçom.',
        badge: 'Mesa Identificada',
      },
      {
        heading: '2. Pedidos Vão Direto para a Cozinha',
        description: 'Os pratos chegam organizados por número de mesa no painel KDS, acelerando o tempo de preparo.',
        badge: 'Sem Fila',
      },
      {
        heading: '3. Fechamento de Conta & 10%',
        description: 'Divisão de conta facilitada entre amigos e inclusão opcional da taxa de 10% do garçom.',
        badge: 'Conta Flexível',
      },
    ],
  },
  {
    id: 'reel_whatsapp',
    title: 'Como o pedido chega pelo WhatsApp',
    subtitle: 'Notificações automáticas via Evolution API em tempo real.',
    duration: '0:48',
    category: 'Automação',
    thumbnailUrl: '/src/assets/images/hero_restaurant_table_1794421912692.jpg',
    accentColor: 'from-sky-600/90 to-blue-950/90',
    storySteps: [
      {
        heading: '1. Mensagem de Confirmação',
        description: 'Assim que o pedido é feito, o WhatsApp do cliente recebe um comprovante com os itens e o código Pix.',
        badge: 'Imediato',
      },
      {
        heading: '2. Atualizações a Cada Etapa',
        description: 'A cozinha muda o status para "Em Preparo" ou "Saiu para Entrega", e o cliente é avisado automaticamente.',
        badge: 'Fim do "Cadê o Pedido?"',
      },
      {
        heading: '3. Link de Rastreio ao Vivo',
        description: 'O cliente acompanha em tempo real o tempo estimado e a rota até sua casa.',
        badge: 'Transparência Total',
      },
    ],
  },
  {
    id: 'reel_kds',
    title: 'Como a cozinha organiza no KDS',
    subtitle: 'Hub centralizado que une pedidos próprios e do iFood.',
    duration: '0:55',
    category: 'Cozinha',
    thumbnailUrl: '/src/assets/images/reel_thumb_order_1794421913435.jpg',
    accentColor: 'from-rose-600/90 to-red-950/90',
    storySteps: [
      {
        heading: '1. Colunas Kanban Inteligentes',
        description: 'Pedidos organizados por: Recebidos, Em Preparo, Prontos e Despachados, com alertas sonoros e SLA visual.',
        badge: 'Gestão Ágil',
      },
      {
        heading: '2. Integração Oficial iFood',
        description: 'Os pedidos do iFood entram no mesmo painel. Avançou no KDS, atualiza no aplicativo do cliente iFood.',
        badge: 'Tela Única',
      },
      {
        heading: '3. Impressão Térmica Automática',
        description: 'Dispare vias para a cozinha, bar e motoboy com 1 clique ou impressão 100% automatizada.',
        badge: 'Comanda Térmica',
      },
    ],
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

  useEffect(() => {
    const status = getConsentStatus();
    setCookieConsent(status);
    if (status === 'granted') {
      initGA4();
    }
    trackConversionEvent('page_view', {
      page_name: 'landing_home_v2',
      tenant_slug: tenant.slug,
    });
  }, [tenant.slug]);

  const handleAcceptAllCookies = () => {
    setConsentStatus('granted');
    setCookieConsent('granted');
  };

  const handleRejectCookies = () => {
    setConsentStatus('denied');
    setCookieConsent('denied');
  };

  // ---------------------------------------------------------------------------
  // 2. Mobile Phone Live Menu Demonstration State
  // ---------------------------------------------------------------------------
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  const [demoCart, setDemoCart] = useState<{ product: DemoProduct; count: number }[]>([
    { product: DEMO_PRODUCTS[0], count: 1 },
  ]);
  const [isDemoCartSheetOpen, setIsDemoCartSheetOpen] = useState<boolean>(false);
  const [demoCheckoutStep, setDemoCheckoutStep] = useState<'bag' | 'customer'>('bag');
  const [demoDeliveryType, setDemoDeliveryType] = useState<'delivery' | 'pickup'>('delivery');
  const [demoCustomerName, setDemoCustomerName] = useState<string>('');
  const [demoCustomerPhone, setDemoCustomerPhone] = useState<string>('');
  const [demoCustomerAddress, setDemoCustomerAddress] = useState<string>('');
  const [demoOrderSimulatedPix, setDemoOrderSimulatedPix] = useState<boolean>(false);

  // Tab switch in "Veja em ação" showcase
  const [actionTab, setActionTab] = useState<'menu' | 'bag' | 'pix' | 'whatsapp' | 'kds'>('menu');

  const demoCategories = ['Todos', 'Burgers', 'Pizzas', 'Acompanhamentos', 'Bebidas'];

  const filteredDemoProducts = useMemo(() => {
    if (selectedCategory === 'Todos') return DEMO_PRODUCTS;
    return DEMO_PRODUCTS.filter((p) => p.category === selectedCategory);
  }, [selectedCategory]);

  const demoTotalCents = useMemo(() => {
    return demoCart.reduce((acc, item) => acc + item.product.priceCents * item.count, 0);
  }, [demoCart]);

  const demoTotalCount = useMemo(() => {
    return demoCart.reduce((acc, item) => acc + item.count, 0);
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

  const handleDecrementDemoProduct = (productId: string) => {
    setDemoCart((prev) => {
      const existing = prev.find((i) => i.product.id === productId);
      if (!existing) return prev;
      if (existing.count <= 1) {
        const filtered = prev.filter((i) => i.product.id !== productId);
        if (filtered.length === 0) {
          setIsDemoCartSheetOpen(false);
          setDemoCheckoutStep('bag');
        }
        return filtered;
      }
      return prev.map((i) =>
        i.product.id === productId ? { ...i, count: i.count - 1 } : i
      );
    });
  };

  const handleClearDemoCart = () => {
    setDemoCart([]);
    setIsDemoCartSheetOpen(false);
    setDemoCheckoutStep('bag');
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
  // 4. Hero Demo Video Player (Interactive 6-Scene Simulation Component)
  // ---------------------------------------------------------------------------
  const [activeSceneIndex, setActiveSceneIndex] = useState<number>(0);
  const [isPlayingVideo, setIsPlayingVideo] = useState<boolean>(true);
  const [isAudioMuted, setIsAudioMuted] = useState<boolean>(true);
  const [heroViewMode, setHeroViewMode] = useState<'both' | 'video' | 'phone'>('both');
  const videoIntervalRef = useRef<number | null>(null);

  const heroScenes = [
    {
      step: 1,
      title: 'Cliente acessa o QR Code',
      badge: 'Mesa ou Bio',
      description: 'O cliente aponta a câmera do celular para o QR Code da mesa ou clica no link da bio do Instagram.',
      screen: 'qr',
    },
    {
      step: 2,
      title: 'Cardápio digital abre na hora',
      badge: 'Sem Baixar App',
      description: 'O menu Aladay carrega em menos de 1s diretamente no navegador móvel com fotos apetitosas.',
      screen: 'menu',
    },
    {
      step: 3,
      title: 'Cliente escolhe os produtos',
      badge: 'Personalização',
      description: 'Seleção fácil de ponto da carne, queijos artesanais e adicionais com cálculo em tempo real.',
      screen: 'customization',
    },
    {
      step: 4,
      title: 'Adiciona itens ao carrinho',
      badge: 'Sacola 2 Passos',
      description: 'Revisão rápida dos pratos, escolha entre Delivery ou Retirada e preenchimento ágil de dados.',
      screen: 'bag',
    },
    {
      step: 5,
      title: 'Pedido vai para WhatsApp & KDS',
      badge: 'Pix Direto',
      description: 'O Pix entra na hora na conta do restaurante e o painel KDS da cozinha recebe a comanda.',
      screen: 'whatsapp_kds',
    },
    {
      step: 6,
      title: 'Digitalize seu restaurante',
      badge: 'Aladay 2.0',
      description: 'Pronto! Seu restaurante modernizado, sem comissões abusivas e com controle total da operação.',
      screen: 'brand',
    },
  ];

  useEffect(() => {
    if (!isPlayingVideo) {
      if (videoIntervalRef.current) clearInterval(videoIntervalRef.current);
      return;
    }
    videoIntervalRef.current = window.setInterval(() => {
      setActiveSceneIndex((prev) => (prev + 1) % heroScenes.length);
    }, 4500);
    return () => {
      if (videoIntervalRef.current) clearInterval(videoIntervalRef.current);
    };
  }, [isPlayingVideo, heroScenes.length]);

  // ---------------------------------------------------------------------------
  // 5. Reels Modal State
  // ---------------------------------------------------------------------------
  const [selectedReel, setSelectedReel] = useState<ReelItem | null>(null);
  const [activeStoryStep, setActiveStoryStep] = useState<number>(0);

  // ---------------------------------------------------------------------------
  // 6. FAQ Accordion State
  // ---------------------------------------------------------------------------
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  const faqs = [
    {
      question: 'Como funciona o teste grátis de 15 dias da Aladay?',
      answer:
        'Você cadastra seu restaurante em menos de 1 minuto, sem precisar informar cartão de crédito no início. Durante 15 dias, você tem acesso total a todos os recursos Pro: cardápio digital ilimitado, QR Code para mesas, pedidos no WhatsApp, painel KDS de cozinha e Pix direto na sua conta bancária. Se gostar, escolhe o plano que preferir para continuar.',
    },
    {
      question: 'A Aladay cobra alguma comissão ou porcentagem sobre as vendas?',
      answer:
        'Não! 0% de comissão. Você paga exclusivamente uma mensalidade fixa de R$ 99,00/mês no Plano Anual no Cartão de Crédito ou R$ 129,90/mês no Plano Mensal. Se você vender R$ 10.000 ou R$ 100.000 no mês, todo o faturamento das vendas diretas fica 100% com o seu restaurante.',
    },
    {
      question: 'Como o dinheiro do Pix entra na minha conta bancária?',
      answer:
        'O Pix cai direto na conta bancária que você cadastrar (Nubank PJ, Inter, Itaú, Bradesco, Santander, etc.). O sistema gera o QR Code dinâmico e o código Pix Copia e Cola no padrão oficial do Banco Central. O cliente paga e o dinheiro é creditado imediatamente na sua conta, sem intermediação nem retenção da Aladay.',
    },
    {
      question: 'Meus clientes precisam baixar algum aplicativo na Play Store ou App Store?',
      answer:
        'Não! Essa é uma das maiores vantagens da Aladay. O cardápio digital funciona 100% no navegador do celular (Chrome, Safari, etc.). O cliente apenas escaneia o QR Code na mesa ou clica no link da sua bio do Instagram e o cardápio abre na hora, rápido e leve.',
    },
    {
      question: 'Como funciona o atendimento de salão e mesas?',
      answer:
        'Você pode gerar QR Codes exclusivos para cada mesa do seu restaurante. O cliente senta, escaneia e faz pedidos sozinho, ou o garçom lança os pedidos pelo próprio celular. Na hora de fechar a conta, o sistema permite incluir os 10% opcionais de serviço e dividir o valor facilmente entre os clientes da mesa.',
    },
    {
      question: 'Posso integrar os pedidos do iFood no mesmo painel da cozinha?',
      answer:
        'Sim! A Aladay possui integração oficial via API de Parceiros do iFood. Quando um pedido entra no iFood, ele aparece automaticamente na mesma tela KDS dos seus pedidos diretos. Ao mudar o status no KDS (Em Preparo, Pronto ou Despachado), o status é sincronizado automaticamente no aplicativo do iFood com código de coleta.',
    },
    {
      question: 'Como o WhatsApp envia as notificações automáticas?',
      answer:
        'A plataforma é integrada à Evolution API. Você conecta o WhatsApp do seu restaurante lendo um QR Code de pareamento. A partir daí, o sistema envia confirmações de pedidos, avisos de saída para entrega e links de rastreio em tempo real sem ocupar os atendentes da sua equipe.',
    },
    {
      question: 'Consigo importar meu cardápio já existente por planilha Excel?',
      answer:
        'Sim! A Aladay oferece um modelo de planilha padrão em Excel/CSV. Você preenche seus pratos, preços, descrições e categorias e importa tudo de uma só vez em segundos.',
    },
  ];

  // ---------------------------------------------------------------------------
  // 7. Modal de Proposta Personalizada (Redes & Franquias)
  // ---------------------------------------------------------------------------
  const [isProposalModalOpen, setIsProposalModalOpen] = useState<boolean>(false);
  const [proposalForm, setProposalForm] = useState({
    name: '',
    restaurantName: '',
    storesCount: '3 a 5 unidades',
    whatsapp: '',
    city: '',
    email: '',
  });
  const [proposalSent, setProposalSent] = useState<boolean>(false);

  const openSupportWhatsApp = (encodedText: string) => {
    const link = document.createElement('a');
    link.href = `https://wa.me/559131976334?text=${encodedText}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSubmitProposal = (e: React.FormEvent) => {
    e.preventDefault();
    trackConversionEvent('request_proposal', {
      stores_count: proposalForm.storesCount,
      city: proposalForm.city,
    });
    setProposalSent(true);
    setTimeout(() => {
      const text = encodeURIComponent(
        `Olá equipe Aladay! Solicito proposta para o meu grupo gastronômico:\n` +
          `• Nome: ${proposalForm.name}\n` +
          `• Restaurante: ${proposalForm.restaurantName}\n` +
          `• Unidades: ${proposalForm.storesCount}\n` +
          `• Cidade: ${proposalForm.city}\n` +
          `• WhatsApp: ${proposalForm.whatsapp}`
      );
      openSupportWhatsApp(text);
      setIsProposalModalOpen(false);
      setProposalSent(false);
    }, 1200);
  };

  // ---------------------------------------------------------------------------
  // Tracked Handlers
  // ---------------------------------------------------------------------------
  const handleScrollToSection = (sectionId: string, source: string) => {
    trackConversionEvent('navigation_click', { section: sectionId, source });
    const target = document.getElementById(sectionId);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleTrackedSignup = (source: string) => {
    trackConversionEvent('click_signup', {
      source,
      plan: 'pro_129_90',
    });
    onNavigateToSetup();
  };

  const handleTrackedWhatsApp = (source: string) => {
    trackConversionEvent('click_whatsapp_contact', {
      source,
      channel: 'whatsapp_commercial',
    });
    const msg = encodeURIComponent(
      'Olá! Gostaria de tirar dúvidas sobre o Aladay Cardápios Digitais (Plano R$ 99,00/mês Anual ou R$ 129,90/mês com Pix Direto).'
    );
    openSupportWhatsApp(msg);
  };

  return (
    <div className="w-full text-slate-900 selection:bg-blue-600 selection:text-white">
      {/* ================================================================== */}
      {/* 1. LAYOUT CINEMATOGRÁFICO UNIFICADO (HERO + MOCKUP + VÍDEO DEMO)   */}
      {/* Headline: "Seu restaurante mais digital. Seus pedidos..."           */}
      {/* ================================================================== */}
      <section
        id="hero-cinematografico"
        className="relative overflow-hidden pt-8 pb-16 sm:pt-14 sm:pb-24 border-b border-slate-800 bg-slate-950 text-white"
      >
        {/* Ambient cinematic lighting & grid */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1100px] h-[550px] bg-gradient-to-b from-blue-600/20 via-indigo-600/10 to-transparent rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-1/3 -left-20 w-[450px] h-[450px] bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-1/2 -right-20 w-[450px] h-[450px] bg-blue-700/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b18_1px,transparent_1px),linear-gradient(to_bottom,#1e293b18_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none opacity-50" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 space-y-10 sm:space-y-12">
          {/* Top Pitch & Exact Headline */}
          <div className="text-center max-w-4xl mx-auto space-y-5">
            {/* Quiet Micro Tagline */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-slate-700/80 text-slate-300 text-xs font-semibold shadow-inner">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <span>Plataforma SaaS para Restaurantes &middot; Aladay 2.0</span>
            </div>

            {/* Exact Requested Headline */}
            <h1 className="text-3xl sm:text-5xl lg:text-[58px] font-extrabold tracking-tight text-white leading-[1.08] text-balance">
              Seu restaurante mais digital. <br className="hidden sm:inline" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-sky-300 to-blue-500">
                Seus pedidos muito mais simples.
              </span>
            </h1>

            {/* Exact Requested Subtitle */}
            <p className="text-base sm:text-lg text-slate-300 leading-relaxed font-normal max-w-2xl mx-auto">
              Modernize seu atendimento com cardápio digital, QR Code e pedidos pelo WhatsApp. Uma experiência prática para o seu restaurante e seus clientes.
            </p>

            {/* Primary & Secondary Action CTAs */}
            <div className="pt-2 flex flex-wrap items-center justify-center gap-3.5">
              <button
                type="button"
                onClick={() => handleTrackedSignup('hero_cinematic_primary')}
                className="px-7 py-4 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-blue-600/30 hover:shadow-blue-500/40 hover:-translate-y-0.5 flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0 group"
              >
                <span>Começar teste grátis</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setHeroViewMode('video');
                  handleScrollToSection('demonstracao-video', 'hero_cinematic_secondary');
                }}
                className="px-6 py-4 bg-slate-900/90 hover:bg-slate-800 text-slate-100 text-sm font-semibold rounded-xl transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0 border border-slate-700/80 shadow-sm hover:border-slate-600"
              >
                <Play className="w-4 h-4 text-blue-400 fill-blue-400" />
                <span>Ver demonstração em vídeo</span>
              </button>
            </div>

            {/* Trust Metric Strip */}
            <div className="pt-6 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 max-w-3xl mx-auto">
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 text-center">
                <p className="text-2xl font-black text-white font-mono tracking-tight">0%</p>
                <p className="text-xs text-slate-400 font-medium">Comissão sobre vendas</p>
              </div>
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 text-center">
                <p className="text-2xl font-black text-sky-400 font-mono tracking-tight">100%</p>
                <p className="text-xs text-slate-400 font-medium">Pix direto no seu banco</p>
              </div>
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 text-center">
                <p className="text-2xl font-black text-emerald-400 font-mono tracking-tight">15 dias</p>
                <p className="text-xs text-slate-400 font-medium">Teste grátis sem cartão</p>
              </div>
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 text-center">
                <p className="text-2xl font-black text-white font-mono tracking-tight">R$ 99/mês</p>
                <p className="text-xs text-slate-400 font-medium">No plano anual no cartão</p>
              </div>
            </div>
          </div>

          {/* ================================================================ */}
          {/* O PALCO CINEMATOGRÁFICO (SMARTPHONE + VÍDEO DEMO INTEGRADO)       */}
          {/* ================================================================ */}
          <div
            id="demonstracao-video"
            className="bg-slate-900/90 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl relative scroll-mt-24"
          >
            {/* Stage Navigation & Mode Switcher Bar */}
            <div className="bg-slate-950/90 border-b border-slate-800 px-4 py-3 sm:px-6 sm:py-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-bold text-white uppercase tracking-wider text-[11px]">
                  Demonstração Aladay 2.0
                </span>
                <span className="hidden sm:inline text-slate-500">&middot;</span>
                <span className="hidden sm:inline text-slate-400">
                  Cena {activeSceneIndex + 1} de {heroScenes.length} ({heroScenes[activeSceneIndex].badge})
                </span>
              </div>

              {/* View Modes Selector */}
              <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setHeroViewMode('both')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer hidden lg:inline-flex items-center gap-1.5 ${
                    heroViewMode === 'both'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Vista Dupla Cinema</span>
                </button>
                <button
                  type="button"
                  onClick={() => setHeroViewMode('video')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                    heroViewMode === 'video'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Vídeo Demo Otimizado</span>
                </button>
                <button
                  type="button"
                  onClick={() => setHeroViewMode('phone')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                    heroViewMode === 'phone'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Mockup Smartphone</span>
                </button>
              </div>
            </div>

            {/* Stage Body */}
            <div className="p-4 sm:p-6 lg:p-8">
              <div
                className={`grid gap-8 items-center ${
                  heroViewMode === 'both'
                    ? 'grid-cols-1 lg:grid-cols-12'
                    : 'grid-cols-1 max-w-4xl mx-auto'
                }`}
              >
                {/* -------------------------------------------------------- */}
                {/* 1. MOCKUP DO SMARTPHONE (CARDÁPIO DIGITAL REAL & AO VIVO)  */}
                {/* -------------------------------------------------------- */}
                {(heroViewMode === 'both' || heroViewMode === 'phone') && (
                  <div
                    className={`${
                      heroViewMode === 'both' ? 'lg:col-span-5' : 'w-full max-w-md mx-auto'
                    } relative flex justify-center`}
                  >
                    <div className="relative w-full max-w-[370px]">
                      {/* Floating Real Food Badge */}
                      <div className="absolute -top-3 -right-3 z-20 bg-slate-900/95 backdrop-blur-md rounded-2xl p-2.5 shadow-xl border border-slate-700/80 hidden sm:flex items-center gap-2.5 max-w-[220px]">
                        <img
                          src="/src/assets/images/hero_food_burger_1794421911219.jpg"
                          alt="Smash burger artesanal no cardápio Aladay"
                          className="w-11 h-11 rounded-xl object-cover shrink-0 border border-slate-700"
                        />
                        <div className="min-w-0 text-left">
                          <span className="text-[9px] font-bold text-sky-400 uppercase tracking-wide">
                            Mais Pedido Hoje
                          </span>
                          <p className="text-xs font-bold text-white truncate">Smash Cheddar Duplo</p>
                          <p className="text-[11px] font-mono font-bold text-emerald-400">R$ 38,90</p>
                        </div>
                      </div>

                      {/* Floating QR Code Badge */}
                      <div className="absolute -bottom-3 -left-3 z-20 bg-slate-950 text-white rounded-2xl p-2.5 shadow-xl border border-slate-700 flex items-center gap-2.5 max-w-[210px]">
                        <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
                          <QrCode className="w-5 h-5" />
                        </div>
                        <div className="text-left text-xs">
                          <p className="font-bold text-white">QR Code de Mesa</p>
                          <p className="text-[10px] text-slate-400">Escaneou, pediu, pagou.</p>
                        </div>
                      </div>

                      {/* Realistic Phone Frame */}
                      <div className="w-full bg-slate-950 rounded-[44px] p-3 shadow-2xl border-4 border-slate-800 relative select-none flex flex-col">
                        {/* Speaker & Dynamic Header */}
                        <div className="w-24 h-5 bg-slate-900 rounded-full mx-auto relative z-30 flex items-center justify-between px-2 text-[8px] text-slate-400 font-mono mb-2 shrink-0">
                          <span className="text-[9px] text-white">19:42</span>
                          <div className="w-2 h-2 rounded-full bg-slate-700" />
                          <span className="text-[9px] text-sky-400">5G</span>
                        </div>

                        {/* Inner Screen */}
                        <div className="rounded-[32px] overflow-hidden bg-slate-900 flex flex-col border border-slate-800 text-left text-white">
                          {/* Header banner */}
                          <div className="bg-slate-950 p-3 shrink-0 border-b border-slate-800">
                            <div className="flex items-center justify-between text-[11px] text-slate-400 pb-1">
                              <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                Restaurante Aberto
                              </span>
                              <span className="font-mono text-[10px] text-slate-400">Preparo 25-35 min</span>
                            </div>
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-white font-black text-xs shrink-0 shadow-md">
                                A
                              </div>
                              <div className="min-w-0">
                                <h3 className="text-xs font-bold text-white truncate">
                                  Cardápio Digital Aladay
                                </h3>
                                <p className="text-[10px] text-slate-400 truncate flex items-center gap-1">
                                  <MapPin className="w-2.5 h-2.5 text-blue-400" />
                                  <span>Mesa 04 &middot; Balcão &middot; WhatsApp</span>
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Interactive Categories Bar */}
                          <div className="bg-slate-950/80 border-b border-slate-800 px-2 py-1.5 flex gap-1 overflow-x-auto no-scrollbar shrink-0 text-[11px]">
                            {demoCategories.map((cat) => (
                              <button
                                key={cat}
                                type="button"
                                onClick={() => setSelectedCategory(cat)}
                                className={`px-2.5 py-1 rounded-lg whitespace-nowrap font-semibold transition-colors cursor-pointer text-[10px] ${
                                  selectedCategory === cat
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                                }`}
                              >
                                {cat}
                              </button>
                            ))}
                          </div>

                          {/* Product preview list */}
                          <div className="p-2 space-y-2 max-h-[310px] overflow-y-auto no-scrollbar">
                            {filteredDemoProducts.slice(0, 3).map((prod) => {
                              const inCart = demoCart.find((i) => i.product.id === prod.id);
                              return (
                                <div
                                  key={prod.id}
                                  className="bg-slate-950/90 border border-slate-800 rounded-xl p-2 flex gap-2.5 items-center hover:border-slate-700 transition-colors"
                                >
                                  <img
                                    src={prod.imageUrl}
                                    alt={prod.name}
                                    className="w-14 h-14 rounded-lg object-cover shrink-0 border border-slate-800"
                                  />
                                  <div className="min-w-0 flex-1 text-left">
                                    <div className="flex items-center gap-1.5">
                                      {prod.badge && (
                                        <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">
                                          {prod.badge}
                                        </span>
                                      )}
                                      <p className="text-[11px] font-bold text-white truncate">
                                        {prod.name}
                                      </p>
                                    </div>
                                    <p className="text-[9px] text-slate-400 line-clamp-1">
                                      {prod.description}
                                    </p>
                                    <p className="text-[11px] font-mono font-bold text-sky-400 pt-0.5">
                                      {(prod.priceCents / 100).toLocaleString('pt-BR', {
                                        style: 'currency',
                                        currency: 'BRL',
                                      })}
                                    </p>
                                  </div>
                                  <div className="shrink-0">
                                    {inCart ? (
                                      <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-0.5 border border-slate-700">
                                        <button
                                          type="button"
                                          onClick={() => handleDecrementDemoProduct(prod.id)}
                                          className="w-5 h-5 flex items-center justify-center text-slate-300 hover:text-white"
                                        >
                                          <Minus className="w-2.5 h-2.5" />
                                        </button>
                                        <span className="text-[10px] font-mono font-bold px-1 text-white">
                                          {inCart.count}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => handleAddDemoProduct(prod)}
                                          className="w-5 h-5 flex items-center justify-center text-slate-300 hover:text-white"
                                        >
                                          <Plus className="w-2.5 h-2.5" />
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => handleAddDemoProduct(prod)}
                                        className="px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold transition-colors cursor-pointer"
                                      >
                                        + Pedir
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Bottom Sticky Floating Cart Bar in Mockup */}
                          {demoTotalCount > 0 && (
                            <div className="p-2 bg-slate-950 border-t border-slate-800 shrink-0">
                              <button
                                type="button"
                                onClick={() => setIsDemoCartSheetOpen(true)}
                                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl py-2 px-3 flex items-center justify-between text-[11px] font-bold cursor-pointer transition-colors shadow-md"
                              >
                                <span className="flex items-center gap-1.5">
                                  <ShoppingBag className="w-3.5 h-3.5" />
                                  <span>Ver Sacola ({demoTotalCount})</span>
                                </span>
                                <span className="font-mono">
                                  {(demoTotalCents / 100).toLocaleString('pt-BR', {
                                    style: 'currency',
                                    currency: 'BRL',
                                  })}
                                </span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* -------------------------------------------------------- */}
                {/* 2. VÍDEO DEMO OTIMIZADO (SIMULAÇÃO 6 CENAS & TIMELINE)   */}
                {/* -------------------------------------------------------- */}
                {(heroViewMode === 'both' || heroViewMode === 'video') && (
                  <div
                    className={`${
                      heroViewMode === 'both' ? 'lg:col-span-7' : 'w-full'
                    } flex flex-col space-y-4`}
                  >
                    {/* Scene Stage Viewport */}
                    <div className="bg-black rounded-2xl border border-slate-800 overflow-hidden relative min-h-[360px] sm:min-h-[400px] flex flex-col justify-between p-5 sm:p-7 shadow-2xl">
                      {/* Ambient background poster */}
                      <img
                        src="/src/assets/images/hero_restaurant_table_1794421912692.jpg"
                        alt="Restaurante Aladay"
                        className="absolute inset-0 w-full h-full object-cover opacity-20 filter blur-xs"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/70 to-transparent" />

                      {/* Top Overlay Badge & Playback Status */}
                      <div className="relative z-10 flex items-center justify-between">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-600/30 border border-blue-400/40 text-sky-300 text-xs font-mono font-bold">
                          <span>CENA {heroScenes[activeSceneIndex].step} DE 6</span>
                          <span>&middot;</span>
                          <span>{heroScenes[activeSceneIndex].badge}</span>
                        </div>

                        {/* Player Mini Controls */}
                        <div className="flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-md px-2 py-1 rounded-lg border border-slate-700/80">
                          <button
                            type="button"
                            onClick={() => setIsPlayingVideo((prev) => !prev)}
                            className="p-1 rounded text-slate-300 hover:text-white transition-colors cursor-pointer"
                            title={isPlayingVideo ? 'Pausar simulação' : 'Reproduzir simulação'}
                          >
                            {isPlayingVideo ? (
                              <Pause className="w-3.5 h-3.5 text-blue-400" />
                            ) : (
                              <Play className="w-3.5 h-3.5 text-emerald-400" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveSceneIndex(0)}
                            className="p-1 rounded text-slate-300 hover:text-white transition-colors cursor-pointer"
                            title="Reiniciar do início"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsAudioMuted((prev) => !prev)}
                            className="p-1 rounded text-slate-300 hover:text-white transition-colors cursor-pointer"
                            title={isAudioMuted ? 'Ativar avisos sonoros' : 'Silenciar'}
                          >
                            {isAudioMuted ? (
                              <VolumeX className="w-3.5 h-3.5" />
                            ) : (
                              <Volume2 className="w-3.5 h-3.5 text-sky-400" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Main Animated Scene Card */}
                      <div className="relative z-10 my-4 bg-slate-900/90 backdrop-blur-md rounded-2xl p-5 sm:p-6 border border-slate-700/90 shadow-2xl text-left space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-sky-400 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                            {heroScenes[activeSceneIndex].badge}
                          </span>
                          <span className="font-mono text-[11px] text-slate-400">
                            Passo {activeSceneIndex + 1}/6
                          </span>
                        </div>

                        <h3 className="text-lg sm:text-2xl font-extrabold text-white">
                          {heroScenes[activeSceneIndex].title}
                        </h3>

                        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                          {heroScenes[activeSceneIndex].description}
                        </p>

                        {/* Interactive Context Pill for each scene */}
                        <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between text-xs text-slate-400 gap-2">
                          <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            <span>
                              {activeSceneIndex === 0 && 'Câmera nativa lê o QR em 0.5s'}
                              {activeSceneIndex === 1 && 'Carrega direto no Chrome/Safari'}
                              {activeSceneIndex === 2 && 'Ponto da carne e adicionais'}
                              {activeSceneIndex === 3 && 'Revisão transparente com Pix'}
                              {activeSceneIndex === 4 && 'Comanda na cozinha e aviso no Whats'}
                              {activeSceneIndex === 5 && 'Sua operação moderna e autônoma'}
                            </span>
                          </span>
                          <span className="font-mono text-sky-400 text-[11px]">
                            Aladay SaaS &middot; 0% Comissão
                          </span>
                        </div>
                      </div>

                      {/* Bottom Scrubber Progress Bar */}
                      <div className="relative z-10 w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-blue-500 h-1.5 transition-all duration-300"
                          style={{
                            width: `${((activeSceneIndex + 1) / heroScenes.length) * 100}%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Interactive Scene Roadmap (Click to jump to any scene) */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {heroScenes.map((scene, idx) => (
                        <button
                          key={scene.step}
                          type="button"
                          onClick={() => {
                            setActiveSceneIndex(idx);
                            setIsPlayingVideo(false);
                          }}
                          className={`text-left p-2.5 rounded-xl transition-all cursor-pointer border flex items-center gap-2 ${
                            activeSceneIndex === idx
                              ? 'bg-blue-600/30 border-blue-500 text-white shadow-xs'
                              : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900'
                          }`}
                        >
                          <span
                            className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                              activeSceneIndex === idx
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {scene.step}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-bold truncate text-white">
                              {scene.title}
                            </p>
                            <p className="text-[9px] text-slate-400 truncate">{scene.badge}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>



      {/* ================================================================== */}
      {/* 3. SEÇÃO DE FUNCIONALIDADES (CONFIRMADAS DO PRODUTO)                */}
      {/* Título: "Tudo que seu restaurante precisa para começar a vender..." */}
      {/* ================================================================== */}
      <section id="recursos" className="py-16 sm:py-24 bg-white scroll-mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="max-w-3xl space-y-3">
            <span className="text-xs font-bold text-blue-600 uppercase tracking-widest font-mono">
              Recursos &middot; Plataforma Completa
            </span>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-950 tracking-tight text-balance">
              Tudo que seu restaurante precisa para começar a vender digitalmente.
            </h2>
            <p className="text-base text-slate-600">
              Recursos modernos projetados para eliminar atritos, aumentar o ticket médio e dar independência total ao seu negócio.
            </p>
          </div>

          {/* 6 High-Fidelity Feature Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* 1. Cardápio Digital Responsivo */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-7 space-y-4 hover:border-blue-400 transition-all shadow-xs hover:shadow-md flex flex-col justify-between">
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center">
                  <Smartphone className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-slate-950">
                  Cardápio Digital Responsivo
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  Carregamento instantâneo no navegador do celular, sem download de aplicativo. Interface moderna com fotos dos pratos, busca em tempo real e categorias organizadas.
                </p>
              </div>
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-mono">
                <span>100% Mobile Friendly</span>
                <span className="text-blue-600 font-bold">Zero Instalação</span>
              </div>
            </div>

            {/* 2. QR Code Inteligente de Mesa & Balcão */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-7 space-y-4 hover:border-blue-400 transition-all shadow-xs hover:shadow-md flex flex-col justify-between">
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center">
                  <QrCode className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-slate-950">
                  Acesso ao Cardápio por QR Code
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  Gere QR Codes individuais para cada mesa ou para o balcão. O cliente escaneia com a câmera nativa, faz o pedido sozinho e a cozinha já sabe exatamente onde entregar.
                </p>
              </div>
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-mono">
                <span>Mesas &amp; Balcão</span>
                <span className="text-blue-600 font-bold">Identificação Fácil</span>
              </div>
            </div>

            {/* 3. Pedidos Encaminhados pelo WhatsApp */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-7 space-y-4 hover:border-blue-400 transition-all shadow-xs hover:shadow-md flex flex-col justify-between">
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center">
                  <MessageSquare className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-slate-950">
                  Pedidos Encaminhados pelo WhatsApp
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  Automação oficial via Evolution API. O cliente recebe confirmação do pedido, tempo estimado e avisos a cada troca de status sem sobrecarregar sua equipe de atendimento.
                </p>
              </div>
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-mono">
                <span>Notificações Automáticas</span>
                <span className="text-blue-600 font-bold">Evolution API</span>
              </div>
            </div>

            {/* 4. Experiência de Compra pelo Celular */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-7 space-y-4 hover:border-blue-400 transition-all shadow-xs hover:shadow-md flex flex-col justify-between">
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center">
                  <ShoppingBag className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-slate-950">
                  Experiência de Compra pelo Celular
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  Fluxo claro em 2 etapas: o cliente escolhe os produtos, revisa a sacola e preenche seus dados para entrega ou retirada, com pagamento Pix dinâmico 100% na sua conta.
                </p>
              </div>
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-mono">
                <span>Fluxo em 2 Etapas</span>
                <span className="text-blue-600 font-bold">Alta Conversão</span>
              </div>
            </div>

            {/* 5. Organização de Produtos e Categorias */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-7 space-y-4 hover:border-blue-400 transition-all shadow-xs hover:shadow-md flex flex-col justify-between">
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-slate-950">
                  Organização de Produtos &amp; Categorias
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  Configure fotos, descrições, pontos de carne e adicionais com facilidade. Suporte para importação em massa via planilha Excel/CSV para colocar seu cardápio no ar em minutos.
                </p>
              </div>
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-mono">
                <span>Planilha Excel / CSV</span>
                <span className="text-blue-600 font-bold">Cadastro Rápido</span>
              </div>
            </div>

            {/* 6. Recursos de Gestão Disponíveis */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-7 space-y-4 hover:border-blue-400 transition-all shadow-xs hover:shadow-md flex flex-col justify-between">
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center">
                  <ChefHat className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-slate-950">
                  Gestão KDS, Salão &amp; Hub iFood
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  Painel KDS para a cozinha com cronômetro SLA visual, mapa de mesas no salão, impressão térmica automática e integração oficial com os pedidos do iFood na mesma tela.
                </p>
              </div>
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-mono">
                <span>KDS + Salão + iFood</span>
                <span className="text-blue-600 font-bold">Controle Unificado</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* 4. SEÇÃO "VEJA A ALADAY EM AÇÃO"                                   */}
      {/* Demonstração visual interativa com alternância de telas            */}
      {/* ================================================================== */}
      <section id="demonstracao" className="py-16 sm:py-24 bg-slate-50 border-y border-slate-200/80 scroll-mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="max-w-3xl space-y-3">
            <span className="text-xs font-bold text-blue-600 uppercase tracking-widest font-mono">
              Demonstração ao Vivo
            </span>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-950 tracking-tight">
              Veja a Aladay em ação
            </h2>
            <p className="text-sm sm:text-base text-slate-600">
              Alterne entre as diferentes telas do sistema e sinta a fluidez que seus clientes e sua equipe terão no dia a dia.
            </p>
          </div>

          {/* Screen Tabs Bar */}
          <div className="flex flex-wrap items-center gap-2 p-1.5 bg-white border border-slate-200 rounded-2xl shadow-xs max-w-3xl">
            <button
              type="button"
              onClick={() => setActionTab('menu')}
              className={`flex-1 min-w-[120px] py-2.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer text-center ${
                actionTab === 'menu'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              1. Cardápio do Cliente
            </button>
            <button
              type="button"
              onClick={() => setActionTab('bag')}
              className={`flex-1 min-w-[120px] py-2.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer text-center ${
                actionTab === 'bag'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              2. Sacola &amp; Checkout
            </button>
            <button
              type="button"
              onClick={() => setActionTab('pix')}
              className={`flex-1 min-w-[120px] py-2.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer text-center ${
                actionTab === 'pix'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              3. Pix Direto na Conta
            </button>
            <button
              type="button"
              onClick={() => setActionTab('whatsapp')}
              className={`flex-1 min-w-[120px] py-2.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer text-center ${
                actionTab === 'whatsapp'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              4. WhatsApp Automático
            </button>
            <button
              type="button"
              onClick={() => setActionTab('kds')}
              className={`flex-1 min-w-[120px] py-2.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer text-center ${
                actionTab === 'kds'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              5. Painel KDS Cozinha
            </button>
          </div>

          {/* Screen Showcase Container */}
          <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-10 shadow-sm grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Left Description of Active Tab */}
            <div className="lg:col-span-5 space-y-4 text-left">
              <span className="text-xs font-mono font-bold text-blue-600 uppercase tracking-wider">
                {actionTab === 'menu' && 'Navegação Leve e Rápida'}
                {actionTab === 'bag' && 'Fluxo sem Fricção'}
                {actionTab === 'pix' && 'Dinheiro Imediato no seu Banco'}
                {actionTab === 'whatsapp' && 'Comunicação Automática'}
                {actionTab === 'kds' && 'Cozinha Organizada e Produtiva'}
              </span>

              <h3 className="text-2xl font-black text-slate-950">
                {actionTab === 'menu' && 'O cliente visualiza o prato e compra pelo apetite'}
                {actionTab === 'bag' && 'Revisão sem cadastro chato nem senhas'}
                {actionTab === 'pix' && '0% de comissão retida. Todo o lucro é seu.'}
                {actionTab === 'whatsapp' && 'Mensagens de status em tempo real'}
                {actionTab === 'kds' && 'Todas as comandas em uma única tela'}
              </h3>

              <p className="text-sm text-slate-600 leading-relaxed">
                {actionTab === 'menu' &&
                  'Layout responsivo com fotos destacadas, pontos da carne e adicionais. O cliente navega por categorias sem travar e adiciona produtos com 1 toque.'}
                {actionTab === 'bag' &&
                  'O cliente confere seus itens, escolhe entre Delivery ou Retirada, informa o WhatsApp e o endereço. Tudo em uma única tela limpa.'}
                {actionTab === 'pix' &&
                  'QR Code padrão BACEN EMV e Pix Copia e Cola gerados na hora com a chave Pix do seu banco. Liquidação instantânea na sua conta.'}
                {actionTab === 'whatsapp' &&
                  'Confirmação com resumo do pedido, aviso de prato em preparo e link para o cliente acompanhar o motoboy em tempo real.'}
                {actionTab === 'kds' &&
                  'Chega de confusão de comandas de papel! Seus pedidos próprios e do iFood chegam em cartões visuais com SLA e botão de avanço rápido.'}
              </p>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => handleTrackedSignup('showcase_tab_cta')}
                  className="px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-2 cursor-pointer"
                >
                  <span>Experimentar na Prática</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Right: Mockup Surface representing active tab */}
            <div className="lg:col-span-7 flex justify-center">
              <div className="w-full max-w-lg bg-slate-950 rounded-2xl p-4 shadow-xl border border-slate-800 text-white">
                {actionTab === 'menu' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800 pb-2">
                      <span className="font-bold text-white">aladay.com.br/menu</span>
                      <span className="text-emerald-400 font-mono">● Online</span>
                    </div>
                    <div className="space-y-2">
                      {DEMO_PRODUCTS.slice(0, 2).map((item) => (
                        <div key={item.id} className="bg-slate-900 rounded-xl p-3 flex gap-3 items-center border border-slate-800">
                          <img src={item.imageUrl} alt={item.name} className="w-14 h-14 rounded-lg object-cover" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-white truncate">{item.name}</p>
                            <p className="text-[10px] text-slate-400 line-clamp-1">{item.description}</p>
                            <p className="text-xs font-mono font-bold text-sky-400 mt-1">
                              R$ {(item.priceCents / 100).toFixed(2).replace('.', ',')}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {actionTab === 'bag' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800 pb-2">
                      <span className="font-bold text-white">1. Sua Sacola</span>
                      <span className="text-sky-400 font-mono">1 Item Selecionado</span>
                    </div>
                    <div className="bg-slate-900 rounded-xl p-3 border border-slate-800 space-y-2 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-white">Smash Cheddar Duplo</span>
                        <span className="font-mono text-sky-400">R$ 38,90</span>
                      </div>
                      <p className="text-[11px] text-slate-400">Ponto: Ao Ponto &middot; Molho extra à parte</p>
                      <div className="pt-2 border-t border-slate-800 flex justify-between font-bold text-xs">
                        <span>Total com entrega:</span>
                        <span className="font-mono text-emerald-400">R$ 44,90</span>
                      </div>
                    </div>
                  </div>
                )}

                {actionTab === 'pix' && (
                  <div className="space-y-3 text-center p-2">
                    <div className="inline-flex p-3 bg-white rounded-xl shadow-md text-slate-900 mx-auto">
                      <QrCode className="w-24 h-24 text-slate-900" />
                    </div>
                    <p className="text-xs font-bold text-white">Pix Dinâmico BACEN EMV</p>
                    <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                      Pagamento efetuado direto para a conta PJ da sua empresa. Sem taxas de intermediação.
                    </p>
                  </div>
                )}

                {actionTab === 'whatsapp' && (
                  <div className="bg-slate-900 rounded-xl p-4 border border-slate-800 space-y-2 text-left">
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 pb-1 border-b border-slate-800">
                      <MessageSquare className="w-4 h-4" />
                      <span>WhatsApp Oficial do Restaurante</span>
                    </div>
                    <p className="text-xs text-slate-200 leading-relaxed font-sans">
                      &ldquo;Olá, Marcos! Seu pedido <strong>#4891</strong> foi confirmado pela cozinha! 🍔 Tempo estimado: 35 minutos. Acompanhe seu pedido pelo link ao vivo.&rdquo;
                    </p>
                    <span className="text-[10px] text-slate-500 font-mono">Enviado automaticamente via Evolution API</span>
                  </div>
                )}

                {actionTab === 'kds' && (
                  <div className="grid grid-cols-2 gap-2 text-left">
                    <div className="bg-slate-900 rounded-xl p-3 border border-blue-500/50 space-y-1.5">
                      <div className="flex justify-between items-center text-[10px] text-sky-400 font-mono font-bold">
                        <span>#4891 &middot; MESA 04</span>
                        <span className="text-amber-400">⏱️ 08:12</span>
                      </div>
                      <p className="text-xs font-bold text-white">2x Smash Burger</p>
                      <span className="text-[10px] text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800 inline-block font-mono">
                        EM PREPARO
                      </span>
                    </div>

                    <div className="bg-slate-900 rounded-xl p-3 border border-red-500/50 space-y-1.5">
                      <div className="flex justify-between items-center text-[10px] text-red-400 font-mono font-bold">
                        <span>iFood #8410</span>
                        <span className="text-slate-400">⏱️ 14:00</span>
                      </div>
                      <p className="text-xs font-bold text-white">1x Pizza Calabresa</p>
                      <span className="text-[10px] text-sky-400 bg-sky-950/60 px-2 py-0.5 rounded border border-sky-800 inline-block font-mono">
                        PRONTO P/ ENTREGA
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* 5. SEÇÃO DE REELS E VÍDEOS VERTICAIS (9:16)                        */}
      {/* Título: "Veja como é simples usar a Aladay."                       */}
      {/* ================================================================== */}
      <section className="py-16 sm:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="max-w-3xl space-y-3">
            <span className="text-xs font-bold text-blue-600 uppercase tracking-widest font-mono">
              Reels &amp; Vídeos Curtos (9:16)
            </span>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-950 tracking-tight">
              Veja como é simples usar a Aladay.
            </h2>
            <p className="text-sm sm:text-base text-slate-600">
              Demonstrações práticas e rápidas de cada funcionalidade. Toque em qualquer vídeo para assistir em tamanho expandido.
            </p>
          </div>

          {/* Horizontal responsive reels cards grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 sm:gap-6">
            {REELS_DATA.map((reel) => (
              <div
                key={reel.id}
                onClick={() => {
                  setSelectedReel(reel);
                  setActiveStoryStep(0);
                  trackConversionEvent('open_reel_modal', { reel_id: reel.id });
                }}
                className="group relative rounded-2xl overflow-hidden shadow-md hover:shadow-xl transition-all cursor-pointer aspect-[9/16] bg-slate-900 border border-slate-200 hover:scale-[1.02]"
              >
                {/* Reel Thumbnail with zero broken image fallback */}
                <img
                  src={reel.thumbnailUrl}
                  alt={reel.title}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                />

                {/* Scrim Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />

                {/* Top Badge & Duration */}
                <div className="absolute top-3 left-3 right-3 flex items-center justify-between text-[11px] text-white">
                  <span className="px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-xs font-semibold text-[10px]">
                    {reel.category}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-xs font-mono text-[10px]">
                    {reel.duration}
                  </span>
                </div>

                {/* Center Play Button */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-white/90 text-slate-950 flex items-center justify-center shadow-lg group-hover:bg-blue-600 group-hover:text-white transition-all transform group-hover:scale-110">
                    <Play className="w-5 h-5 fill-current ml-0.5" />
                  </div>
                </div>

                {/* Bottom Title */}
                <div className="absolute bottom-3 left-3 right-3 text-left space-y-1">
                  <h4 className="text-xs sm:text-sm font-bold text-white line-clamp-2 leading-snug">
                    {reel.title}
                  </h4>
                  <p className="text-[10px] text-slate-300 line-clamp-1">
                    {reel.subtitle}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* 6. SEÇÃO "COMO FUNCIONA" (3 ETAPAS SEQUENCIAIS)                     */}
      {/* 1. Configure seu cardápio -> 2. Compartilhe QR -> 3. Receba Whats  */}
      {/* ================================================================== */}
      <section className="py-16 sm:py-24 bg-slate-50 border-y border-slate-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="max-w-3xl space-y-3">
            <span className="text-xs font-bold text-blue-600 uppercase tracking-widest font-mono">
              Processo Simples
            </span>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-950 tracking-tight">
              Como funciona em 3 passos simples
            </h2>
            <p className="text-sm sm:text-base text-slate-600">
              Você não precisa de técnico nem de semanas de espera. Seu cardápio fica pronto para vender hoje mesmo.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {/* Step 1 */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-7 space-y-4 shadow-xs relative text-left">
              <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white font-extrabold flex items-center justify-center text-lg shadow-md shadow-blue-600/20">
                1
              </div>
              <h3 className="text-lg font-bold text-slate-950">
                1. Configure seu cardápio
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Organize os produtos e disponibilize o menu digital. Cadastre fotos, adicionais e preços ou importe sua planilha existente em poucos cliques.
              </p>
            </div>

            {/* Step 2 */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-7 space-y-4 shadow-xs relative text-left">
              <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white font-extrabold flex items-center justify-center text-lg shadow-md shadow-blue-600/20">
                2
              </div>
              <h3 className="text-lg font-bold text-slate-950">
                2. Compartilhe seu QR Code
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Facilite o acesso dos clientes pelo celular. Imprima o QR Code nas mesas, deixe no balcão e coloque o link do cardápio na bio do seu Instagram.
              </p>
            </div>

            {/* Step 3 */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-7 space-y-4 shadow-xs relative text-left">
              <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white font-extrabold flex items-center justify-center text-lg shadow-md shadow-blue-600/20">
                3
              </div>
              <h3 className="text-lg font-bold text-slate-950">
                3. Receba pedidos pelo WhatsApp
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Simplifique o processo de atendimento e recebimento de pedidos. O Pix cai na hora na sua conta, a comanda vai para a cozinha e o cliente recebe avisos.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* 7. BANNER PROMOCIONAL DE DESTAQUE                                  */}
      {/* Título: "Seu restaurante merece uma experiência digital melhor."    */}
      {/* ================================================================== */}
      <section className="py-16 sm:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 text-white rounded-3xl p-8 sm:p-14 lg:p-16 relative overflow-hidden shadow-2xl border border-slate-800 text-left">
            {/* Background elements */}
            <div className="absolute top-0 right-0 -mr-24 -mt-24 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center relative z-10">
              <div className="lg:col-span-8 space-y-4">
                <span className="text-xs font-mono font-bold text-sky-400 uppercase tracking-widest">
                  Modernização Gastronômica
                </span>
                <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-[1.12]">
                  Seu restaurante merece uma experiência digital melhor.
                </h2>
                <p className="text-base sm:text-lg text-slate-300 max-w-xl leading-relaxed">
                  Comece a modernizar seu atendimento com a Aladay.
                </p>
              </div>

              <div className="lg:col-span-4 flex flex-col sm:flex-row lg:flex-col gap-3">
                <button
                  type="button"
                  onClick={() => handleTrackedSignup('promo_banner')}
                  className="px-6 py-4 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
                >
                  <span>Experimentar gratuitamente</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleTrackedWhatsApp('promo_banner_whatsapp')}
                  className="px-6 py-4 bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white text-sm font-semibold rounded-xl border border-slate-700 transition-colors flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
                >
                  <PhoneCall className="w-4 h-4 text-sky-400" />
                  <span>Tirar dúvidas no WhatsApp</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* 8. PLANOS E PREÇOS REAIS ALADAY                                    */}
      {/* Anual R$ 99,00/mês Cartão (12x) & Mensal R$ 129,90/mês             */}
      {/* ================================================================== */}
      <section id="planos" className="py-16 sm:py-24 bg-slate-50 border-t border-slate-200/80 scroll-mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="max-w-3xl space-y-3">
            <span className="text-xs font-bold text-blue-600 uppercase tracking-widest font-mono">
              Valores Transparentes
            </span>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-950 tracking-tight">
              Planos claros, sem surpresas e com 0% de comissão
            </h2>
            <p className="text-sm sm:text-base text-slate-600">
              Você paga apenas uma assinatura fixa para manter a infraestrutura no ar. Todo o faturamento dos seus pedidos é 100% seu.
            </p>
          </div>

          {/* Pricing Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            {/* Plano Anual R$ 99/mês (Cartão de Crédito) */}
            <div className="lg:col-span-6 bg-slate-950 text-white rounded-3xl p-8 sm:p-10 flex flex-col justify-between border-2 border-blue-500 relative shadow-2xl">
              <div className="absolute -top-3.5 right-6 bg-blue-600 text-white text-[11px] font-extrabold px-3 py-1 rounded-full shadow-md flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5" />
                <span>PLANO MAIS VANTAJOSO &middot; ECONOMIZE R$ 370,80/ANO</span>
              </div>

              <div className="space-y-6">
                <div>
                  <span className="text-xs font-semibold text-sky-400 uppercase tracking-wider font-mono">
                    Ciclo Anual &middot; 12x no Cartão
                  </span>
                  <h3 className="text-2xl sm:text-3xl font-black text-white mt-1">Plano Aladay Anual</h3>
                  <p className="text-xs sm:text-sm text-slate-400 mt-1">
                    Ideal para restaurantes que buscam o menor custo mensal fixo parcelado no cartão de crédito.
                  </p>
                </div>

                <div className="border-y border-slate-800 py-5 space-y-2">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-4xl sm:text-5xl font-black font-mono text-white">R$ 99,00</span>
                    <span className="text-slate-400 text-sm font-semibold">/mês</span>
                    <span className="ml-auto text-xs font-mono text-sky-400 bg-slate-900 px-3 py-1 rounded-lg border border-slate-800 font-bold">
                      24% OFF
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-mono">
                    12 parcelas de R$ 99,00 no Cartão de Crédito &middot; Total R$ 1.188,00/ano
                  </p>
                </div>

                <div className="space-y-3 text-xs sm:text-sm text-slate-300">
                  <div className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                    <span><strong>0% de comissão</strong> sobre todas as suas vendas</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                    <span>Cardápio digital ilimitado para Delivery, Balcão e QR Code</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                    <span>Pix dos pedidos 100% direto na conta bancária da sua loja</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                    <span>Automação completa de pedidos no WhatsApp via Evolution API</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                    <span>Painel KDS de cozinha com cronômetro SLA e impressão térmica</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                    <span>Módulo de Salão &amp; Mesas: QR Code por mesa e divisão de conta</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                    <span>Integração Oficial com a API do iFood no mesmo painel KDS</span>
                  </div>
                </div>
              </div>

              <div className="pt-8 mt-6 border-t border-slate-800 space-y-2">
                <button
                  type="button"
                  onClick={() => handleTrackedSignup('pricing_annual_card')}
                  className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm rounded-xl transition-all shadow-md shadow-blue-600/30 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Assinar Anual por R$ 99,00/mês no Cartão</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <p className="text-[11px] text-slate-400 text-center font-mono">
                  Inclui 15 dias de teste grátis &middot; Economia de R$ 370,80 ao ano
                </p>
              </div>
            </div>

            {/* Plano Mensal R$ 129,90/mês */}
            <div className="lg:col-span-6 bg-white border border-slate-200/90 rounded-3xl p-8 sm:p-10 flex flex-col justify-between shadow-sm">
              <div className="space-y-6">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-blue-600 uppercase tracking-wider font-mono">
                      Assinatura Mensal Flexível
                    </span>
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                      15 Dias Grátis
                    </span>
                  </div>
                  <h3 className="text-2xl sm:text-3xl font-black text-slate-950 mt-1">Plano Aladay Mensal</h3>
                  <p className="text-xs sm:text-sm text-slate-600 mt-1">
                    Sem fidelidade ou carência. Pague mês a mês via Pix, Cartão ou Boleto.
                  </p>
                </div>

                <div className="border-y border-slate-200 py-5 space-y-2">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-4xl sm:text-5xl font-black font-mono text-slate-950">R$ 129,90</span>
                    <span className="text-slate-500 text-sm font-semibold">/mês</span>
                  </div>
                  <p className="text-xs text-blue-600 font-mono font-semibold">
                    Pix, Cartão de Crédito ou Boleto &middot; Cancele quando quiser
                  </p>
                </div>

                <div className="space-y-3 text-xs sm:text-sm text-slate-700">
                  <div className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span>Todos os recursos do sistema liberados</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span>0% de comissão sobre qualquer venda</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span>Pix dos pedidos 100% direto na sua conta bancária</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span>KDS Cozinha + WhatsApp Automático (Evolution API)</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span>Módulo de Mesas &amp; Salão com QR Code individual</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span>Integração Oficial com pedidos do iFood no KDS</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span>Sem multa rescisória e sem fidelidade anual</span>
                  </div>
                </div>
              </div>

              <div className="pt-8 mt-6 border-t border-slate-200 space-y-2">
                <button
                  type="button"
                  onClick={() => handleTrackedSignup('pricing_monthly_card')}
                  className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Começar 15 Dias Grátis no Plano Mensal</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <p className="text-[11px] text-slate-500 text-center font-mono">
                  R$ 0,00 hoje &middot; Primeira cobrança somente após 15 dias
                </p>
              </div>
            </div>
          </div>

          {/* Comparativo de Custos & Economia */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <div className="p-4 sm:p-5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wide">
                Comparativo Real: Aplicativos Tradicionais vs Aladay
              </h4>
              <span className="text-xs font-mono font-bold text-blue-600">Mais Lucro no Seu Bolso</span>
            </div>
            <div className="overflow-x-auto text-xs sm:text-sm">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-white">
                    <th className="py-3 px-4 font-semibold text-slate-700">Item</th>
                    <th className="py-3 px-4 font-semibold text-slate-500">Apps Tradicionais (Marketplaces)</th>
                    <th className="py-3 px-4 font-bold text-blue-700 bg-blue-50/70">Aladay Cardápios Digitais</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  <tr>
                    <td className="py-3.5 px-4 font-medium text-slate-900">Comissão por Pedido</td>
                    <td className="py-3.5 px-4 text-rose-600 font-semibold">12% a 27% sobre cada venda</td>
                    <td className="py-3.5 px-4 font-bold text-blue-700 bg-blue-50/70">0% (Zero comissão)</td>
                  </tr>
                  <tr>
                    <td className="py-3.5 px-4 font-medium text-slate-900">Repasse do Dinheiro</td>
                    <td className="py-3.5 px-4 text-slate-600">Até 30 dias (ou taxa extra de antecipação)</td>
                    <td className="py-3.5 px-4 font-bold text-blue-700 bg-blue-50/70">Imediato (Pix direto no seu banco)</td>
                  </tr>
                  <tr>
                    <td className="py-3.5 px-4 font-medium text-slate-900">Base de Clientes</td>
                    <td className="py-3.5 px-4 text-slate-600">Retida pelo app</td>
                    <td className="py-3.5 px-4 font-bold text-blue-700 bg-blue-50/70">100% sua no WhatsApp</td>
                  </tr>
                  <tr>
                    <td className="py-3.5 px-4 font-medium text-slate-900">Custo Mensal Fixo</td>
                    <td className="py-3.5 px-4 text-slate-600">R$ 2.000 a R$ 8.000+ em taxas</td>
                    <td className="py-3.5 px-4 font-bold text-blue-700 bg-blue-50/70">R$ 99/mês (Anual no Cartão) ou R$ 129,90/mês</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* 9. CALCULADORA DE ECONOMIA INTERATIVA                              */}
      {/* ================================================================== */}
      <section id="calculadora" className="py-16 sm:py-24 bg-white scroll-mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="max-w-3xl space-y-3">
            <span className="text-xs font-bold text-blue-600 uppercase tracking-widest font-mono">
              Simulador Financeiro
            </span>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-950 tracking-tight">
              Calcule quanto seu restaurante economiza todo mês
            </h2>
            <p className="text-sm sm:text-base text-slate-600">
              Mova os controles abaixo para simular o valor que você deixa de perder em taxas de entrega.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center bg-slate-50 border border-slate-200/90 rounded-3xl p-6 sm:p-10">
            {/* Sliders */}
            <div className="lg:col-span-7 space-y-6 text-left">
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-semibold">
                  <label htmlFor="slider-orders" className="text-slate-800">
                    Volume de pedidos por mês
                  </label>
                  <span className="font-mono font-bold text-blue-600 text-sm">
                    {monthlyOrders} pedidos
                  </span>
                </div>
                <input
                  id="slider-orders"
                  type="range"
                  min={50}
                  max={2000}
                  step={25}
                  value={monthlyOrders}
                  onChange={(e) => setMonthlyOrders(Number(e.target.value))}
                  className="w-full accent-blue-600 cursor-pointer"
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs font-semibold">
                  <label htmlFor="slider-ticket" className="text-slate-800">
                    Ticket Médio por Pedido (R$)
                  </label>
                  <span className="font-mono font-bold text-blue-600 text-sm">
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
                  onChange={(e) => setAverageTicketBRL(Number(e.target.value))}
                  className="w-full accent-blue-600 cursor-pointer"
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs font-semibold">
                  <label htmlFor="slider-fee" className="text-slate-800">
                    Taxa cobrada pelo aplicativo atual (%)
                  </label>
                  <span className="font-mono font-bold text-rose-600 text-sm">
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
              </div>
            </div>

            {/* Result Card */}
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 sm:p-7 space-y-5 shadow-sm text-left">
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setCalculatorPlanCycle('YEARLY')}
                  className={`py-1.5 px-2 rounded-lg transition-all cursor-pointer text-center ${
                    calculatorPlanCycle === 'YEARLY'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Anual (R$ 99/mês)
                </button>
                <button
                  type="button"
                  onClick={() => setCalculatorPlanCycle('MONTHLY')}
                  className={`py-1.5 px-2 rounded-lg transition-all cursor-pointer text-center ${
                    calculatorPlanCycle === 'MONTHLY'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Mensal (R$ 129,90/mês)
                </button>
              </div>

              <div className="space-y-2 border-b border-slate-200 pb-4 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-600">Faturamento Bruto:</span>
                  <span className="font-mono font-bold text-slate-900">{formatBRL(grossMonthlyRevenue)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Comissão Retida no App ({marketplaceFeePercent}%):</span>
                  <span className="font-mono font-bold text-rose-600">- {formatBRL(marketplaceMonthlyCost)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Assinatura Aladay:</span>
                  <span className="font-mono font-bold text-blue-600">
                    {calculatorPlanCycle === 'YEARLY' ? 'R$ 99,00' : 'R$ 129,90'} / mês
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-xs text-slate-500 font-medium">Economia Líquida Mensal:</p>
                <p className="text-3xl font-black text-emerald-600 font-mono tracking-tight">
                  {formatBRL(monthlySavings)} <span className="text-sm font-sans font-bold text-slate-600">/ mês</span>
                </p>
                <p className="text-xs text-slate-500 font-mono">
                  Isso representa <strong>{formatBRL(annualSavings)} a mais por ano</strong> para o seu restaurante.
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleTrackedSignup('calculator_cta')}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <Calculator className="w-4 h-4" />
                <span>Quero economizar esse valor agora</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* 10. SEGMENTOS ATENDIDOS & PROVA SOCIAL                             */}
      {/* ================================================================== */}
      <section className="py-16 sm:py-24 bg-slate-50 border-t border-slate-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="max-w-3xl space-y-3">
            <span className="text-xs font-bold text-blue-600 uppercase tracking-widest font-mono">
              Para Quem É
            </span>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-950 tracking-tight">
              Feito sob medida para todo o setor de alimentação
            </h2>
            <p className="text-sm sm:text-base text-slate-600">
              A Aladay atende operações gastronômicas de todos os portes com agilidade e facilidade de uso.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 text-center">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-2 shadow-2xs">
              <span className="text-2xl">🍔</span>
              <p className="font-bold text-xs sm:text-sm text-slate-900">Hamburguerias</p>
              <p className="text-[11px] text-slate-500">Combos &amp; pontos</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-2 shadow-2xs">
              <span className="text-2xl">🍕</span>
              <p className="font-bold text-xs sm:text-sm text-slate-900">Pizzarias</p>
              <p className="text-[11px] text-slate-500">Sabores &amp; bordas</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-2 shadow-2xs">
              <span className="text-2xl">🥪</span>
              <p className="font-bold text-xs sm:text-sm text-slate-900">Lanchonetes</p>
              <p className="text-[11px] text-slate-500">Agilidade no balcão</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-2 shadow-2xs">
              <span className="text-2xl">🍽️</span>
              <p className="font-bold text-xs sm:text-sm text-slate-900">Restaurantes</p>
              <p className="text-[11px] text-slate-500">Controle de salão</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-2 shadow-2xs">
              <span className="text-2xl">🛵</span>
              <p className="font-bold text-xs sm:text-sm text-slate-900">Dark Kitchens</p>
              <p className="text-[11px] text-slate-500">Foco em entrega</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-2 shadow-2xs">
              <span className="text-2xl">☕</span>
              <p className="font-bold text-xs sm:text-sm text-slate-900">Cafés &amp; Docerias</p>
              <p className="text-[11px] text-slate-500">Menu visual atraente</p>
            </div>
          </div>

          {/* Franchise / Multi-store bar */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 flex flex-wrap items-center justify-between gap-4 shadow-xs">
            <div className="space-y-1 text-left">
              <h4 className="text-base font-bold text-slate-950 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-600" />
                <span>Possui rede de restaurantes ou franquia com múltiplas unidades?</span>
              </h4>
              <p className="text-xs sm:text-sm text-slate-600">
                Oferecemos suporte a franquias com múltiplos cardápios e painel consolidado.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsProposalModalOpen(true)}
              className="px-5 py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-all cursor-pointer whitespace-nowrap"
            >
              Solicitar Proposta para Redes
            </button>
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* 11. FAQ (DÚVIDAS FREQUENTES ACCORDION)                             */}
      {/* ================================================================== */}
      <section id="faq" className="py-16 sm:py-24 bg-white scroll-mt-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          <div className="text-center space-y-3">
            <span className="text-xs font-bold text-blue-600 uppercase tracking-widest font-mono">
              Perguntas Frequentes
            </span>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-950 tracking-tight">
              Tire todas as suas dúvidas sobre a Aladay
            </h2>
            <p className="text-sm sm:text-base text-slate-600">
              Respostas diretas e transparentes sobre o funcionamento da plataforma.
            </p>
          </div>

          <div className="space-y-3">
            {faqs.map((faq, idx) => {
              const isOpen = openFaqIndex === idx;
              return (
                <div
                  key={faq.question}
                  className="border border-slate-200 rounded-2xl overflow-hidden transition-colors bg-white shadow-2xs"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                    className="w-full text-left p-5 flex items-center justify-between gap-4 cursor-pointer hover:bg-slate-50 transition-colors"
                    aria-expanded={isOpen}
                  >
                    <span className="text-sm sm:text-base font-bold text-slate-900">
                      {faq.question}
                    </span>
                    <ChevronDown
                      className={`w-5 h-5 text-slate-400 shrink-0 transition-transform duration-200 ${
                        isOpen ? 'rotate-180 text-blue-600' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-5 pt-1 text-xs sm:text-sm text-slate-600 leading-relaxed border-t border-slate-100 text-left">
                      {faq.answer}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* 12. CTA FINAL: "Pronto para modernizar seu restaurante?"           */}
      {/* ================================================================== */}
      <section className="py-16 sm:py-24 bg-slate-950 text-white relative overflow-hidden border-t border-slate-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-8 relative z-10">
          <span className="inline-block px-3 py-1 bg-blue-950/80 border border-blue-800 text-sky-400 text-xs font-semibold rounded-full font-mono">
            Comece em Menos de 1 Minuto
          </span>

          <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-[1.12]">
            Pronto para modernizar seu restaurante?
          </h2>

          <p className="text-base sm:text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed">
            Cadastre-se agora e aproveite 15 dias de teste grátis com acesso a todos os recursos. Sem necessidade de cartão de crédito no cadastro.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
            <button
              type="button"
              onClick={() => handleTrackedSignup('bottom_cta_primary')}
              className="px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl transition-all shadow-xl shadow-blue-600/30 flex items-center gap-2 cursor-pointer"
            >
              <span>Começar meu teste grátis</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => handleTrackedWhatsApp('bottom_cta_whatsapp')}
              className="px-7 py-4 bg-slate-900 hover:bg-slate-800 text-slate-200 text-sm font-semibold rounded-xl border border-slate-800 transition-colors flex items-center gap-2 cursor-pointer"
            >
              <PhoneCall className="w-4 h-4 text-sky-400" />
              <span>Falar com especialista no WhatsApp</span>
            </button>
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* 13. QUIET SAAS FOOTER                                              */}
      {/* ================================================================== */}
      <footer className="bg-slate-950 text-slate-400 border-t border-slate-900 py-12 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-6 text-center sm:text-left">
          <div className="flex items-center gap-2 text-white font-bold text-base">
            <span className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-xs font-black">
              A
            </span>
            <span>Aladay Cardápios Digitais</span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 text-slate-400 font-medium">
            <a href="#recursos" className="hover:text-white transition-colors">
              Recursos
            </a>
            <a href="#demonstracao" className="hover:text-white transition-colors">
              Como Funciona
            </a>
            <a href="#planos" className="hover:text-white transition-colors">
              Planos
            </a>
            <a href="#calculadora" className="hover:text-white transition-colors">
              Calculadora
            </a>
            {onNavigateToTerms && (
              <button
                type="button"
                onClick={onNavigateToTerms}
                className="hover:text-white transition-colors cursor-pointer"
              >
                Termos de Uso
              </button>
            )}
            {onNavigateToPrivacy && (
              <button
                type="button"
                onClick={onNavigateToPrivacy}
                className="hover:text-white transition-colors cursor-pointer"
              >
                Privacidade
              </button>
            )}
          </div>

          <p className="text-slate-500 font-mono text-[11px]">
            &copy; {new Date().getFullYear()} Aladay. Todos os direitos reservados.
          </p>
        </div>
      </footer>

      {/* ================================================================== */}
      {/* 14. MODAL DE REELS / VÍDEOS VERTICAIS EXPANDIDO                    */}
      {/* ================================================================== */}
      {selectedReel && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-slate-800 rounded-3xl max-w-sm w-full overflow-hidden shadow-2xl relative animate-in fade-in zoom-in-95 duration-200 aspect-[9/16] flex flex-col text-white">
            {/* Reel Header */}
            <div className="p-4 bg-gradient-to-b from-black/80 to-transparent z-20 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-sky-400 font-mono uppercase">
                  {selectedReel.category}
                </span>
                <h4 className="text-xs font-bold text-white truncate max-w-[200px]">
                  {selectedReel.title}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReel(null)}
                className="p-1.5 rounded-full bg-white/20 hover:bg-white/30 text-white cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Simulated Story Video Backdrop */}
            <div className="flex-1 relative overflow-hidden flex flex-col justify-end p-5">
              <img
                src={selectedReel.thumbnailUrl}
                alt={selectedReel.title}
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/50 to-transparent" />

              {/* Story Content Card */}
              <div className="relative z-10 bg-slate-900/90 backdrop-blur-md rounded-2xl p-4 border border-slate-800 space-y-2 text-left">
                <span className="text-[10px] font-bold text-sky-400 bg-sky-950/60 border border-sky-800 px-2 py-0.5 rounded font-mono inline-block">
                  {selectedReel.storySteps[activeStoryStep].badge}
                </span>
                <h5 className="text-sm font-bold text-white">
                  {selectedReel.storySteps[activeStoryStep].heading}
                </h5>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {selectedReel.storySteps[activeStoryStep].description}
                </p>

                {/* Progress Indicators */}
                <div className="flex gap-1 pt-2">
                  {selectedReel.storySteps.map((_, sIdx) => (
                    <button
                      key={sIdx}
                      type="button"
                      onClick={() => setActiveStoryStep(sIdx)}
                      className={`h-1 flex-1 rounded-full cursor-pointer transition-all ${
                        activeStoryStep === sIdx ? 'bg-blue-500' : 'bg-slate-700'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Story Bottom CTA */}
              <div className="relative z-10 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedReel(null);
                    handleTrackedSignup('reel_modal_cta');
                  }}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
                >
                  <span>Testar 15 Dias Grátis</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* 15. MODAL DE SOLICITAÇÃO DE PROPOSTA (REDES & FRANQUIAS)           */}
      {/* ================================================================== */}
      {isProposalModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-5 shadow-2xl border border-slate-200 relative text-left">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-950">
                  Proposta Personalizada para Redes &amp; Franquias
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Preencha os dados para receber atendimento de nossa equipe corporativa.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsProposalModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {proposalSent ? (
              <div className="p-6 text-center space-y-3 bg-blue-50 rounded-xl border border-blue-200 text-blue-950">
                <CheckCircle2 className="w-10 h-10 text-blue-600 mx-auto" />
                <h4 className="font-bold text-sm">Solicitação Recebida com Sucesso!</h4>
                <p className="text-xs text-slate-600">
                  Redirecionando para o canal direto do WhatsApp para envio da sua proposta...
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
                      Nome da Marca / Restaurante *
                    </label>
                    <input
                      type="text"
                      required
                      value={proposalForm.restaurantName}
                      onChange={(e) => setProposalForm({ ...proposalForm, restaurantName: e.target.value })}
                      placeholder="Ex: Burger Prime"
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
                      <option value="Mais de 20 lojas">Mais de 20 lojas (Franquia)</option>
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
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-300 focus:outline-blue-600 text-slate-900 font-mono"
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
      {/* 16. COOKIE PRIVACY BANNER (LGPD)                                   */}
      {/* ================================================================== */}
      {cookieConsent === 'pending' && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-50 bg-white border border-slate-300 rounded-2xl p-5 shadow-2xl text-xs space-y-3 text-left">
          <div className="flex items-start gap-2.5">
            <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-slate-950">Privacidade &amp; Métricas (LGPD)</p>
              <p className="text-slate-600 leading-relaxed text-[11px]">
                Utilizamos cookies essenciais para o funcionamento do site e métricas anônimas para aprimorar sua experiência.{' '}
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
              Aceitar
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
