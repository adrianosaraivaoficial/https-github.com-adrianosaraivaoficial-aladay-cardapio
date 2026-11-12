import { RestaurantTenant } from '../types';
import { buildPublicMenuUrl } from './publicMenuUrl';

export type SeoView =
  | 'home'
  | 'kickoff'
  | 'consumer'
  | 'admin'
  | 'calculator'
  | 'diagrams'
  | 'tracking'
  | 'whatsapp'
  | 'auth'
  | 'terms'
  | 'privacy';

interface SyncSeoMetadataOptions {
  view: SeoView;
  tenant: RestaurantTenant;
}

const PLATFORM_TITLE = 'Aladay · Software de Cardápios Digitais para Restaurantes';
const PLATFORM_DESCRIPTION =
  'Cardápios digitais para restaurantes com pedidos online, WhatsApp, QR Code de mesa e pagamento Pix direto.';

function setMeta(selector: string, attribute: string, value: string): void {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement('meta');
    const match = selector.match(/meta\[(name|property)="([^"]+)"\]/);
    if (match) element.setAttribute(match[1], match[2]);
    document.head.appendChild(element);
  }
  element.setAttribute(attribute, value);
}

function setCanonical(href: string): void {
  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    document.head.appendChild(canonical);
  }
  canonical.href = href;
}

function setStructuredData(data: Record<string, unknown>): void {
  let script = document.head.querySelector<HTMLScriptElement>('#aladay-structured-data');
  if (!script) {
    script = document.createElement('script');
    script.id = 'aladay-structured-data';
    script.type = 'application/ld+json';
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(data);
}

function isPublicImageUrl(value: string | undefined): value is string {
  return Boolean(value && /^https?:\/\//i.test(value));
}

export function syncSeoMetadata({ view, tenant }: SyncSeoMetadataOptions): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  const isPublicMenu = view === 'consumer';
  const isTracking = view === 'tracking';
  const menuUrl = buildPublicMenuUrl(tenant.slug, window.location.origin);
  const canonicalUrl = isPublicMenu ? menuUrl : `${window.location.origin}/`;
  const title = isPublicMenu
    ? `${tenant.name} · Cardápio digital`
    : isTracking
      ? `${tenant.name} · Acompanhe seu pedido`
      : PLATFORM_TITLE;
  const description = isPublicMenu
    ? `Veja o cardápio de ${tenant.name}, escolha seus produtos e faça seu pedido online.`
    : PLATFORM_DESCRIPTION;
  const shouldIndex = view === 'home' || isPublicMenu || view === 'terms' || view === 'privacy';

  document.title = title;
  setCanonical(canonicalUrl);
  setMeta('meta[name="description"]', 'content', description);
  setMeta('meta[name="robots"]', 'content', shouldIndex ? 'index, follow' : 'noindex, nofollow');
  setMeta('meta[name="theme-color"]', 'content', /^#[0-9a-f]{6}$/i.test(tenant.primaryColor) ? tenant.primaryColor : '#2563EB');
  setMeta('meta[property="og:title"]', 'content', title);
  setMeta('meta[property="og:description"]', 'content', description);
  setMeta('meta[property="og:type"]', 'content', 'website');
  setMeta('meta[property="og:url"]', 'content', canonicalUrl);
  setMeta('meta[name="twitter:title"]', 'content', title);
  setMeta('meta[name="twitter:description"]', 'content', description);

  const existingOgImage = document.head.querySelector<HTMLMetaElement>('meta[property="og:image"]');
  if (isPublicMenu && isPublicImageUrl(tenant.logoUrl)) {
    setMeta('meta[property="og:image"]', 'content', tenant.logoUrl);
  } else {
    existingOgImage?.remove();
  }

  if (isPublicMenu) {
    setStructuredData({
      '@context': 'https://schema.org',
      '@type': 'Restaurant',
      name: tenant.name,
      url: menuUrl,
      hasMenu: menuUrl,
      telephone: tenant.phone || undefined,
      address: tenant.address || undefined,
      image: isPublicImageUrl(tenant.logoUrl) ? tenant.logoUrl : undefined,
      openingHours: tenant.openingHoursText || undefined,
      priceRange: '$$',
    });
    return;
  }

  setStructuredData({
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Aladay',
    url: `${window.location.origin}/`,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    inLanguage: 'pt-BR',
    description: PLATFORM_DESCRIPTION,
  });
}
