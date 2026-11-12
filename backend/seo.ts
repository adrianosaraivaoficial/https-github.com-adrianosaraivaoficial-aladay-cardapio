import type { Express } from 'express';
import type { Pool } from 'pg';
import fs from 'node:fs';
import path from 'node:path';

export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ]!,
  );
}
export function menuHtml(
  template: string,
  tenant: { name: string; slug: string; phone?: string; address?: string },
  origin: string,
) {
  const title = `${tenant.name} · Cardápio digital`;
  const description = `Veja o cardápio de ${tenant.name}, escolha seus produtos e faça seu pedido online.`;
  const canonical = `${origin}/cardapio/${encodeURIComponent(tenant.slug)}`;
  const json = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: tenant.name,
    url: canonical,
    hasMenu: canonical,
    telephone: tenant.phone,
    address: tenant.address,
  }).replace(/</g, '\\u003c');
  return template
    .replace(
      /<title>.*?<\/title>/s,
      () => `<title>${escapeHtml(title)}</title>`,
    )
    .replace(
      /(<meta name="description" content=")[^"]*/,
      (_match, prefix: string) => prefix + escapeHtml(description),
    )
    .replace(
      /(<link rel="canonical" href=")[^"]*/,
      (_match, prefix: string) => prefix + escapeHtml(canonical),
    )
    .replace(
      /(<meta property="og:title" content=")[^"]*/,
      (_match, prefix: string) => prefix + escapeHtml(title),
    )
    .replace(
      /(<meta property="og:description" content=")[^"]*/,
      (_match, prefix: string) => prefix + escapeHtml(description),
    )
    .replace(
      /(<meta property="og:url" content=")[^"]*/,
      (_match, prefix: string) => prefix + escapeHtml(canonical),
    )
    .replace(
      /<script id="aladay-structured-data" type="application\/ld\+json">.*?<\/script>/s,
      () =>
        `<script id="aladay-structured-data" type="application/ld+json">${json}</script>`,
    );
}
export function mountSeo(app: Express, pool: Pool, distPath: string) {
  const origin = (process.env.APP_URL || 'http://localhost:3000').replace(
    /\/$/,
    '',
  );
  const noindex =
    process.env.SEO_NOINDEX === 'true' || process.env.DEPLOY_ENV === 'staging';
  app.use((req, res, next) => {
    if (noindex || /^\/(?:pedido|admin|auth)(?:\/|$)/.test(req.path))
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    next();
  });
  app.get('/robots.txt', (_req, res) =>
    res
      .type('text/plain')
      .send(
        noindex
          ? 'User-agent: *\nDisallow: /\n'
          : `User-agent: *\nDisallow: /api/\nDisallow: /pedido/\nDisallow: /admin\nDisallow: /auth\nSitemap: ${origin}/sitemap.xml\n`,
      ),
  );
  app.get('/sitemap.xml', async (_req, res) => {
    const rows = await pool.query(
      'SELECT slug FROM tenants WHERE slug <> $1 ORDER BY slug',
      ['aladay'],
    );
    const urls = noindex
      ? []
      : [
          origin + '/',
          ...rows.rows.map(
            (row) => `${origin}/cardapio/${encodeURIComponent(row.slug)}`,
          ),
        ];
    res
      .type('application/xml')
      .send(
        `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url) => `<url><loc>${escapeHtml(url)}</loc></url>`).join('')}</urlset>`,
      );
  });
  app.get('/cardapio/:slug', async (req, res, next) => {
    const templatePath = path.join(distPath, 'index.html');
    if (!fs.existsSync(templatePath)) return next();
    const result = await pool.query(
      'SELECT name,slug,phone,address FROM tenants WHERE slug=$1',
      [req.params.slug],
    );
    if (!result.rows[0])
      return res
        .status(404)
        .type('text/plain')
        .send('Cardápio não encontrado.');
    res.setHeader('Cache-Control', 'no-cache');
    res
      .type('html')
      .send(
        menuHtml(fs.readFileSync(templatePath, 'utf8'), result.rows[0], origin),
      );
  });
}
