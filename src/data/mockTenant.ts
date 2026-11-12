import { Category, CustomerRecord, Order, Product, RestaurantTenant } from '../types';

export const INITIAL_TENANT: RestaurantTenant = {
  id: 'tenant_1793902255731',
  name: 'Churrasco da Oda',
  slug: 'churrasco-da-oda',
  phone: '',
  address: 'Belém - PA',
  primaryColor: '#2563EB',
  backgroundColor: '#F8FAFC',
  fontFamily: 'Plus Jakarta Sans',
  logoUrl: '',
  isOpen: true,
  openingHoursText: 'Terça a Domingo: 18:00 às 23:30',
  deliveryEnabled: true,
  pickupEnabled: true,
  deliveryFeeCents: 0,
  minOrderCents: 0,
  deliveryZones: [],
  evolutionInstanceId: 'instancia_churrasco-da-oda',
  evolutionStatus: 'disconnected',
  evolutionApiKeyConfigured: false,
  subscriptionStatus: 'active',
  evolutionApiUrl: '',
  evolutionApiKey: '',
  n8nWebhookUrl: '',
  botAutoReplyEnabled: true,
  botWelcomeMessage:
    'Olá! Seja bem-vindo ao *Churrasco da Oda*! 🔥\nNosso cardápio digital completo está disponível pelo link abaixo:\n\n👉 https://aladay.com.br/cardapio/churrasco-da-oda\n\nPara falar com um atendente, responda com *2*.',
  botClosedHoursMessage:
    'Olá! No momento estamos fechados. Confira nosso horário de funcionamento e veja o cardápio pelo link:\n👉 https://aladay.com.br/cardapio/churrasco-da-oda',
  botHumanHandoffMessage:
    'Perfeito! Um atendente da nossa equipe vai responder sua mensagem em instantes.',
  pixConfig: {
    provider: 'direct_bank',
    pixKey: '',
    pixKeyType: 'phone',
    beneficiaryName: 'CHURRASCO DA ODA',
    merchantName: 'CHURRASCO DA ODA',
    merchantCity: 'BELEM',
    bankName: '',
    autoApproveWebhook: true,
  },
};

export const INITIAL_CATEGORIES: Category[] = [
  { id: 'cat_principal', name: 'Pratos Principais', order: 1 },
  { id: 'cat_bebidas', name: 'Bebidas', order: 2 },
  { id: 'cat_churrascos', name: 'Churrascos Completos', order: 3 },
];

export const INITIAL_PRODUCTS: Product[] = [
  {
    id: 'prod_oda_charque',
    categoryId: 'cat_principal',
    name: 'Espetinho de Charque',
    description: 'Espetinho de charque assado na brasa.',
    priceCents: 500,
    isAvailable: true,
    optionGroups: [],
  },
  {
    id: 'prod_oda_coracao',
    categoryId: 'cat_principal',
    name: 'Espetinho de coração bovino',
    description: 'Espetinho de coração bovino macio e temperado na brasa.',
    priceCents: 500,
    isAvailable: true,
    optionGroups: [],
  },
  {
    id: 'prod_oda_frango',
    categoryId: 'cat_principal',
    name: 'Espetinho de frango',
    description: 'Espetinho de frango suculento assado na brasa.',
    priceCents: 500,
    isAvailable: true,
    optionGroups: [],
  },
  {
    id: 'prod_oda_carne',
    categoryId: 'cat_principal',
    name: 'Espetinho de carne',
    description: 'Espetinho de carne bovina selecionada na brasa.',
    priceCents: 500,
    isAvailable: true,
    optionGroups: [],
  },
  {
    id: 'prod_oda_completo',
    categoryId: 'cat_churrascos',
    name: 'Churrasco completo',
    description: 'Porção completa de churrasco na brasa com acompanhamentos.',
    priceCents: 1200,
    isAvailable: true,
    optionGroups: [],
  },
];

export const INITIAL_ORDERS: Order[] = [];

export const INITIAL_CUSTOMERS: CustomerRecord[] = [];

export const SECOND_TENANT: RestaurantTenant = INITIAL_TENANT;

export const PIZZARIA_CATEGORIES: Category[] = [];

export const PIZZARIA_PRODUCTS: Product[] = [];

export const INITIAL_TENANTS_LIST: RestaurantTenant[] = [INITIAL_TENANT];

