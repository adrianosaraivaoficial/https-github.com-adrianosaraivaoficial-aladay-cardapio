const PUBLIC_MENU_PREFIX = '/cardapio';

export function buildPublicMenuPath(slug: string): string {
  return `${PUBLIC_MENU_PREFIX}/${encodeURIComponent(slug.trim().toLowerCase())}`;
}

export function buildPublicMenuUrl(slug: string, origin?: string): string {
  const resolvedOrigin = origin ?? (typeof window !== 'undefined' ? window.location.origin : 'https://aladay.com.br');
  return `${resolvedOrigin.replace(/\/$/, '')}${buildPublicMenuPath(slug)}`;
}

export function buildPublicTableUrl(slug: string, tableNumber: string, origin?: string): string {
  const url = new URL(buildPublicMenuUrl(slug, origin));
  url.searchParams.set('mesa', tableNumber);
  return url.toString();
}
