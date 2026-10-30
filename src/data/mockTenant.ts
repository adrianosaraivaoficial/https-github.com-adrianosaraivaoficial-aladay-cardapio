import { Category, CustomerRecord, Order, Product, RestaurantTenant } from '../types';

export const INITIAL_TENANT: RestaurantTenant = {
  id: 'tenant_aladay_01',
  name: 'Meu Restaurante',
  slug: 'aladay',
  phone: '',
  address: '',
  primaryColor: '#EA580C',
  backgroundColor: '#FAF9F6',
  fontFamily: 'Plus Jakarta Sans',
  logoUrl: '',
  isOpen: true,
  openingHoursText: 'Terça a Domingo: 18:00 às 23:30',
  deliveryEnabled: true,
  pickupEnabled: true,
  deliveryFeeCents: 0,
  minOrderCents: 0,
  deliveryZones: [],
  evolutionInstanceId: 'aladay',
  evolutionStatus: 'disconnected',
  botAutoReplyEnabled: true,
  botWelcomeMessage:
    'Olá! Seja bem-vindo! Nosso cardápio digital completo está disponível pelo link abaixo:\n\n👉 https://aladay.com.br\n\nPara falar com um atendente, responda com *2*.',
  botClosedHoursMessage:
    'Olá! No momento estamos fechados. Confira nosso horário de funcionamento e veja o cardápio pelo link:\n👉 https://aladay.com.br',
  botHumanHandoffMessage:
    'Perfeito! Um atendente da nossa equipe vai responder sua mensagem em instantes.',
  pixConfig: {
    provider: 'direct_bank',
    pixKey: '',
    pixKeyType: 'cnpj',
    merchantName: 'MEU RESTAURANTE',
    merchantCity: 'SAO PAULO',
    bankName: '',
    autoApproveWebhook: false,
  },
};

export const INITIAL_CATEGORIES: Category[] = [
  { id: 'cat_principal', name: 'Pratos Principais', order: 1 },
  { id: 'cat_acompanhamentos', name: 'Acompanhamentos', order: 2 },
  { id: 'cat_bebidas', name: 'Bebidas', order: 3 },
];

export const INITIAL_PRODUCTS: Product[] = [];

export const INITIAL_ORDERS: Order[] = [];

export const INITIAL_CUSTOMERS: CustomerRecord[] = [];

export const SECOND_TENANT: RestaurantTenant = INITIAL_TENANT;

export const PIZZARIA_CATEGORIES: Category[] = [];

export const PIZZARIA_PRODUCTS: Product[] = [];

export const INITIAL_TENANTS_LIST: RestaurantTenant[] = [INITIAL_TENANT];
