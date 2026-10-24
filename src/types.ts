export type OrderStatus = 'received' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled';
export type PaymentStatus = 'pending' | 'paid_on_delivery' | 'paid_online' | 'cancelled';
export type WhatsAppStatus = 'queued' | 'sending' | 'sent' | 'delivered' | 'failed';
export type UserRole = 'owner' | 'manager' | 'kitchen';

export interface MemberSession {
  userId: string;
  name: string;
  email: string;
  role: UserRole;
  tenantId: string;
  tenantSlug: string;
}

export interface OptionItem {
  id: string;
  name: string;
  priceCents: number;
}

export interface OptionGroup {
  id: string;
  name: string;
  required: boolean;
  minSelections: number;
  maxSelections: number;
  items: OptionItem[];
}

export interface Product {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  priceCents: number;
  imageUrl?: string;
  isAvailable: boolean;
  isFeatured?: boolean;
  optionGroups?: OptionGroup[];
}

export interface Category {
  id: string;
  name: string;
  order: number;
}

export interface DeliveryZone {
  id: string;
  name: string;
  feeCents: number;
  estimatedMinutes: number;
  active: boolean;
}

export interface RestaurantTenant {
  id: string;
  name: string;
  slug: string;
  phone: string;
  address: string;
  primaryColor: string;
  backgroundColor: string;
  fontFamily: string;
  logoUrl?: string;
  isOpen: boolean;
  openingHoursText: string;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  deliveryFeeCents: number;
  minOrderCents: number;
  deliveryZones?: DeliveryZone[];
  evolutionInstanceId: string;
  evolutionStatus: 'connected' | 'connecting' | 'disconnected';
  evolutionApiKeyConfigured: boolean;
  evolutionApiUrl?: string;
  evolutionApiKey?: string;
  n8nWebhookUrl?: string;
  botAutoReplyEnabled?: boolean;
  botWelcomeMessage?: string;
  botClosedHoursMessage?: string;
  botHumanHandoffMessage?: string;
  statusNotificationTemplates?: StatusNotificationTemplates;
  pixConfig?: PixGatewayConfig;
  asaasSubscription?: AsaasSubscriptionData;
}

export type AsaasBillingType = 'PIX' | 'CREDIT_CARD' | 'BOLETO';
export type AsaasSubscriptionStatus = 'ACTIVE' | 'PENDING' | 'OVERDUE' | 'CANCELLED';
export type AsaasInvoiceStatus = 'RECEIVED' | 'CONFIRMED' | 'PENDING' | 'OVERDUE' | 'REFUNDED';

export interface AsaasCustomer {
  id: string;
  name: string;
  email: string;
  cpfCnpj: string;
  phone: string;
}

export interface AsaasInvoice {
  id: string;
  subscriptionId: string;
  referenceMonth: string;
  value: number; // 129.90
  status: AsaasInvoiceStatus;
  dueDate: string;
  paymentDate?: string;
  billingType: AsaasBillingType;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  pixCopiaECola?: string;
  pixQrCodeBase64?: string;
  description: string;
}

export interface AsaasSubscriptionData {
  id: string;
  tenantSlug: string;
  customer: AsaasCustomer;
  planName: string;
  value: number; // 129.90
  cycle: 'MONTHLY';
  status: AsaasSubscriptionStatus;
  billingType: AsaasBillingType;
  nextDueDate: string;
  createdAt: string;
  invoices: AsaasInvoice[];
  lastPaymentDate?: string;
}

export interface AsaasGatewayConfig {
  environment: 'sandbox' | 'production';
  apiKey: string;
  webhookToken: string;
  webhookUrl: string;
}

export interface StatusNotificationTemplates {
  confirmed?: string;
  preparing?: string;
  ready_delivery?: string;
  ready_pickup?: string;
  delivered?: string;
  cancelled?: string;
}

export interface OrderItemOption {
  groupId: string;
  groupName: string;
  itemId: string;
  itemName: string;
  priceCents: number;
}

export interface OrderItem {
  productId: string;
  productName: string;
  unitPriceCents: number;
  quantity: number;
  selectedOptions: OrderItemOption[];
  notes?: string;
  totalCents: number;
}

export interface Order {
  id: string;
  orderNumber: number;
  tenantId: string;
  tenantSlug?: string;
  customerName: string;
  customerPhone: string;
  type: 'delivery' | 'pickup';
  deliveryAddress?: string;
  deliveryZoneName?: string;
  estimatedMinutes?: number;
  items: OrderItem[];
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: string;
  whatsAppStatus: WhatsAppStatus;
  pixTransaction?: PixTransaction;
  whatsAppLogs: Array<{
    timestamp: string;
    event: string;
    detail: string;
    messageText?: string;
    statusSent?: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface PixTransaction {
  txid: string;
  orderId: string;
  tenantSlug: string;
  amountCents: number;
  pixCopiaECola: string;
  qrCodeBase64?: string;
  status: 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELLED';
  expiresAt: string;
  paidAt?: string;
  endToEndId?: string;
  psp: 'direct_bank' | 'openpix' | 'mercadopago' | 'asaas' | 'efi' | 'simulated';
}

export interface PixGatewayConfig {
  provider: 'direct_bank' | 'openpix' | 'mercadopago' | 'asaas' | 'efi' | 'manual';
  pixKey: string;
  pixKeyType: 'cpf' | 'cnpj' | 'email' | 'phone' | 'random';
  merchantName: string;
  merchantCity: string;
  bankName?: string;
  autoApproveWebhook: boolean;
  webhookUrl?: string;
  apiKeyConfigured?: boolean;
}

export interface CustomerRecord {
  id: string;
  name: string;
  phone: string;
  ordersCount: number;
  totalSpentCents: number;
  firstOrderAt: string;
  lastOrderAt: string;
  marketingConsent: boolean;
  notes?: string;
}

export interface SaaSFinancialMetrics {
  activeRestaurants: number;
  subscriptionPriceBRL: number; // 129.90
  // Costs
  vpsServerCostBRL: number;
  evolutionInstancesCostBRL: number;
  databaseManagedCostBRL: number;
  s3CdnCostBRL: number;
  gatewayFeePercent: number; // e.g. 3.5%
  gatewayFixedFeeBRL: number; // e.g. 0.49
  taxPercent: number; // e.g. 6% (Simples Nacional)
  supportLaborCostBRL: number;
  marketingCacBRL: number;
  monthlyChurnPercent: number;
}

export interface BlueprintSection {
  id: string;
  number: string;
  title: string;
  subtitle: string;
  summary: string;
  contentMarkdown: string;
  tags: string[];
}

export interface Invoice {
  id: string;
  referenceMonth: string;
  amountCents: number; // 12990
  status: 'paid' | 'pending' | 'overdue';
  dueDate: string;
  paidAt?: string;
  paymentMethod: 'Pix' | 'Cartão de Crédito';
  pixCode?: string;
}

export interface SubscriptionInfo {
  status: 'active' | 'trial' | 'past_due' | 'cancelled';
  planName: string;
  priceCents: number; // 12990
  currentPeriodEnd: string;
  trialDaysLeft?: number;
  invoices: Invoice[];
}

export interface WebhookLogEvent {
  id: string;
  timestamp: string;
  source: 'evolution' | 'n8n' | 'system' | 'pix_gateway' | 'auth_guard' | 'asaas';
  eventType: string;
  instance: string;
  senderPhone?: string;
  messageText?: string;
  direction: 'inbound' | 'outbound';
  status: 'success' | 'filtered' | 'error';
  payloadSummary: string;
  fullPayload?: any;
}

export type JwtRole = 'SUPER_ADMIN' | 'TENANT_OWNER' | 'KITCHEN_STAFF';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: JwtRole;
  tenantId: string | '*';
  tenantSlug: string | '*';
  tenantName: string;
  permissions: string[];
}

export interface JwtClaims {
  sub: string;
  name: string;
  email: string;
  role: JwtRole;
  tenant_id: string;
  tenant_slug: string;
  permissions: string[];
  iss: string;
  iat: number;
  exp: number;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
  claims: JwtClaims;
  authMethod: 'password' | 'whatsapp_otp';
  authenticatedAt: string;
}

export interface AuthAuditLog {
  id: string;
  timestamp: string;
  userEmail: string;
  userName: string;
  role: JwtRole;
  tenantSlug: string;
  method: 'password' | 'whatsapp_otp';
  ip: string;
  status: 'SUCCESS' | 'OTP_SENT' | 'DENIED';
  detail: string;
}
export interface EvolutionQrConnectResponse {
  instanceName: string;
  state: 'open' | 'close' | 'connecting';
  code?: string;
  base64?: string;
  pairingCode?: string;
  count?: number;
  expiresInSeconds?: number;
  connectedPhone?: string;
  profileName?: string;
  batteryLevel?: number;
  serverUrl?: string;
  lastSync?: string;
}
