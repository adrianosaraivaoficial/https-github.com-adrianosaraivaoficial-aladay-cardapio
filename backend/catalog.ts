import crypto from 'node:crypto';
import type { Express, RequestHandler } from 'express';
import type { Pool, PoolClient } from 'pg';
import { HttpError, transactionalRoute } from './database';
import { phoneNumber } from './security';

type Input = Record<string, unknown>;
function object(value: unknown): Input {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new HttpError(400, 'Dados inválidos.');
  return value as Input;
}
function text(value: unknown, limit: number, fallback = ''): string {
  return String(value ?? fallback)
    .trim()
    .slice(0, limit);
}
function cents(value: unknown): number {
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < 0 ||
    Number(value) > 10000000
  )
    throw new HttpError(400, 'Valor em centavos inválido.');
  return Number(value);
}
function id(value: unknown): string {
  const valueId = text(value, 80);
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(valueId))
    throw new HttpError(400, 'Identificador inválido.');
  return valueId;
}
function image(value: unknown): string {
  const url = text(value, 600000);
  if (
    url &&
    !/^https:\/\//.test(url) &&
    !/^\/(?!\/)/.test(url) &&
    !/^data:image\/(?:png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(url)
  )
    throw new HttpError(400, 'Imagem inválida.');
  return url;
}
function optionGroups(value: unknown): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 30)
    throw new HttpError(400, 'Grupos de adicionais inválidos.');
  return value.map((entry) => {
    const group = object(entry);
    if (!Array.isArray(group.items) || group.items.length > 100)
      throw new HttpError(400, 'Adicionais inválidos.');
    const min = Number(group.minSelections || (group.required ? 1 : 0));
    const max = Number(group.maxSelections || group.items.length || 1);
    if (
      !Number.isInteger(min) ||
      !Number.isInteger(max) ||
      min < 0 ||
      max < min ||
      max > 100
    )
      throw new HttpError(400, 'Limites de adicionais inválidos.');
    return {
      id: id(group.id),
      name: text(group.name, 80),
      required: Boolean(group.required),
      minSelections: min,
      maxSelections: max,
      items: group.items.map((entry) => {
        const item = object(entry);
        return {
          id: id(item.id),
          name: text(item.name, 100),
          priceCents: cents(item.priceCents ?? 0),
        };
      }),
    };
  });
}
async function tenantLock(client: PoolClient, slug: string) {
  const result = await client.query(
    'SELECT * FROM tenants WHERE slug=$1 FOR UPDATE',
    [slug],
  );
  if (!result.rows[0]) throw new HttpError(404, 'Restaurante não encontrado.');
  return result.rows[0];
}
async function categoryWrite(
  client: PoolClient,
  tenant: { id: string; slug: string },
  value: unknown,
  index = 0,
) {
  const cat = object(value);
  const categoryId = id(cat.id || `cat_${crypto.randomUUID()}`);
  const result = await client.query(
    `INSERT INTO categories (id,tenant_id,tenant_slug,name,display_order)
    VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,display_order=EXCLUDED.display_order
    WHERE categories.tenant_slug=EXCLUDED.tenant_slug RETURNING id`,
    [
      categoryId,
      tenant.id,
      tenant.slug,
      text(cat.name, 120, 'Categoria'),
      Number.isInteger(cat.order) ? cat.order : index + 1,
    ],
  );
  if (!result.rows.length)
    throw new HttpError(409, 'Identificador de categoria indisponível.');
  return categoryId;
}
async function productWrite(
  client: PoolClient,
  tenant: { id: string; slug: string },
  value: unknown,
) {
  const product = object(value);
  const productId = id(product.id || `prod_${crypto.randomUUID()}`);
  const categoryId = id(product.categoryId);
  const category = await client.query(
    'SELECT 1 FROM categories WHERE id=$1 AND tenant_slug=$2',
    [categoryId, tenant.slug],
  );
  if (!category.rows.length)
    throw new HttpError(400, 'Categoria não pertence ao restaurante.');
  const result = await client.query(
    `INSERT INTO products
    (id,tenant_id,tenant_slug,category_id,name,description,price_cents,image_url,is_available,is_featured,option_groups)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb) ON CONFLICT (id) DO UPDATE SET category_id=EXCLUDED.category_id,
    name=EXCLUDED.name,description=EXCLUDED.description,price_cents=EXCLUDED.price_cents,image_url=EXCLUDED.image_url,
    is_available=EXCLUDED.is_available,is_featured=EXCLUDED.is_featured,option_groups=EXCLUDED.option_groups,updated_at=NOW()
    WHERE products.tenant_slug=EXCLUDED.tenant_slug RETURNING id`,
    [
      productId,
      tenant.id,
      tenant.slug,
      categoryId,
      text(product.name, 150, 'Produto'),
      text(product.description, 2000),
      cents(product.priceCents),
      image(product.imageUrl),
      product.isAvailable !== false,
      product.isFeatured === true,
      JSON.stringify(optionGroups(product.optionGroups)),
    ],
  );
  if (!result.rows.length)
    throw new HttpError(409, 'Identificador de produto indisponível.');
  return productId;
}
async function settingsWrite(client: PoolClient, slug: string, value: unknown) {
  const input = object(value);
  // Only an explicit allowlist is writable. Claims, subscription, integrations and tenant IDs are never accepted.
  const fields: Record<string, string> = {
    name: 'name',
    logoUrl: 'logo_url',
    phone: 'phone',
    address: 'address',
    primaryColor: 'primary_color',
    isOpen: 'is_open',
    openingHoursText: 'opening_hours_text',
    deliveryFeeCents: 'delivery_fee_cents',
    minOrderCents: 'min_order_cents',
    deliveryZones: 'delivery_zones',
    tablesCount: 'tables_count',
  };
  const values: unknown[] = [slug];
  const updates: string[] = [];
  for (const [key, column] of Object.entries(fields)) {
    if (input[key] === undefined) continue;
    let value: unknown = input[key];
    if (key.endsWith('Cents')) value = cents(value);
    else if (key === 'logoUrl') value = image(value);
    else if (key === 'phone') {
      value = phoneNumber(value);
      if (String(value).includes('9131976334'))
        throw new HttpError(400, 'Número reservado.');
    } else if (key === 'isOpen') {
      if (typeof value !== 'boolean')
        throw new HttpError(400, 'Status inválido.');
    } else if (key === 'tablesCount') {
      if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 1000)
        throw new HttpError(400, 'Quantidade de mesas inválida.');
    } else if (key === 'primaryColor') {
      if (!/^#[a-f0-9]{6}$/i.test(String(value)))
        throw new HttpError(400, 'Cor inválida.');
    } else if (key === 'deliveryZones') {
      if (!Array.isArray(value) || value.length > 100)
        throw new HttpError(400, 'Zonas inválidas.');
      value = JSON.stringify(
        value.map((entry) => {
          const zone = object(entry);
          return {
            id: id(zone.id),
            name: text(zone.name, 100),
            feeCents: cents(zone.feeCents),
            estimatedMinutes: Math.max(
              1,
              Math.min(300, Number(zone.estimatedMinutes) || 35),
            ),
            active: zone.active !== false,
          };
        }),
      );
    } else value = text(value, key === 'address' ? 500 : 200);
    values.push(value);
    updates.push(
      `${column}=$${values.length}${key === 'deliveryZones' ? '::jsonb' : ''}`,
    );
  }
  if (updates.length)
    await client.query(
      `UPDATE tenants SET ${updates.join(',')},updated_at=NOW() WHERE slug=$1`,
      values,
    );
}
export function mountCatalog(
  app: Express,
  pool: Pool,
  guard: RequestHandler,
  refresh: (slug: string) => Promise<void>,
) {
  const sync: RequestHandler = transactionalRoute(
    pool,
    async (req, res, client, afterCommit) => {
      const tenant = await tenantLock(client, req.params.slug);
      const input = object(req.body);
      const categories = input.categories;
      const products = input.products;
      if (
        (categories !== undefined &&
          (!Array.isArray(categories) || categories.length > 1000)) ||
        (products !== undefined &&
          (!Array.isArray(products) || products.length > 5000))
      )
        throw new HttpError(400, 'Catálogo inválido.');
      const categoryIds: string[] = [];
      const productIds: string[] = [];
      for (const category of (categories || []) as unknown[])
        categoryIds.push(
          await categoryWrite(client, tenant, category, categoryIds.length),
        );
      for (const product of (products || []) as unknown[])
        productIds.push(await productWrite(client, tenant, product));
      if (req.path.endsWith('/sync') || input.mode === 'replace') {
        if (
          Array.isArray(products) &&
          (products.length > 0 ||
            input.allowEmptyOverwrite === true ||
            input.mode === 'replace')
        )
          await client.query(
            'DELETE FROM products WHERE tenant_slug=$1 AND NOT(id=ANY($2::text[]))',
            [tenant.slug, productIds],
          );
        if (
          Array.isArray(categories) &&
          (categories.length > 0 ||
            input.allowEmptyOverwrite === true ||
            input.mode === 'replace')
        ) {
          const orphan = await client.query(
            'SELECT 1 FROM products WHERE tenant_slug=$1 AND NOT(category_id=ANY($2::text[])) LIMIT 1',
            [tenant.slug, categoryIds],
          );
          if (orphan.rows.length)
            throw new HttpError(
              400,
              'Há produtos vinculados às categorias removidas.',
            );
          await client.query(
            'DELETE FROM categories WHERE tenant_slug=$1 AND NOT(id=ANY($2::text[]))',
            [tenant.slug, categoryIds],
          );
        }
      }
      if (input.tenant) await settingsWrite(client, tenant.slug, input.tenant);
      afterCommit(() => {
        void refresh(tenant.slug).catch(() => {});
      });
      res.json({
        success: true,
        categoriesSynced: categoryIds.length,
        productsSynced: productIds.length,
      });
    },
  );
  app.post('/api/v1/tenants/:slug/catalog/sync', guard, sync);
  app.post('/api/v1/tenants/:slug/catalog/import', guard, sync);
  app.put(
    '/api/v1/tenants/:slug/settings',
    guard,
    transactionalRoute(pool, async (req, res, client, afterCommit) => {
      await tenantLock(client, req.params.slug);
      await settingsWrite(client, req.params.slug, req.body);
      afterCommit(() => {
        void refresh(req.params.slug).catch(() => {});
      });
      res.json({ success: true });
    }),
  );
  for (const method of ['post', 'put'] as const)
    app[method](
      `/api/v1/tenants/:slug/products${method === 'put' ? '/:id' : ''}`,
      guard,
      transactionalRoute(pool, async (req, res, client, afterCommit) => {
        const tenant = await tenantLock(client, req.params.slug);
        const product = object(req.body);
        if (method === 'put') {
          const exists = await client.query(
            'SELECT 1 FROM products WHERE id=$1 AND tenant_slug=$2',
            [req.params.id, tenant.slug],
          );
          if (!exists.rows.length)
            throw new HttpError(404, 'Produto não encontrado.');
        }
        const productId = await productWrite(client, tenant, {
          ...product,
          id: method === 'put' ? req.params.id : product.id,
        });
        afterCommit(() => {
          void refresh(tenant.slug).catch(() => {});
        });
        res.json({
          success: true,
          data: { ...product, id: productId, tenantSlug: tenant.slug },
        });
      }),
    );
  app.delete(
    '/api/v1/tenants/:slug/products/:id',
    guard,
    transactionalRoute(pool, async (req, res, client, afterCommit) => {
      await tenantLock(client, req.params.slug);
      const result = await client.query(
        'DELETE FROM products WHERE id=$1 AND tenant_slug=$2 RETURNING id',
        [req.params.id, req.params.slug],
      );
      if (!result.rows.length)
        throw new HttpError(404, 'Produto não encontrado.');
      afterCommit(() => {
        void refresh(req.params.slug).catch(() => {});
      });
      res.json({ success: true });
    }),
  );
  app.patch(
    '/api/v1/tenants/:slug/products/:id/toggle-availability',
    guard,
    transactionalRoute(pool, async (req, res, client, afterCommit) => {
      await tenantLock(client, req.params.slug);
      const result = await client.query(
        'UPDATE products SET is_available=NOT is_available,updated_at=NOW() WHERE id=$1 AND tenant_slug=$2 RETURNING is_available',
        [req.params.id, req.params.slug],
      );
      if (!result.rows.length)
        throw new HttpError(404, 'Produto não encontrado.');
      afterCommit(() => {
        void refresh(req.params.slug).catch(() => {});
      });
      res.json({
        success: true,
        data: { id: req.params.id, isAvailable: result.rows[0].is_available },
      });
    }),
  );
  app.post(
    '/api/v1/tenants/:slug/categories',
    guard,
    transactionalRoute(pool, async (req, res, client, afterCommit) => {
      const tenant = await tenantLock(client, req.params.slug);
      const categoryId = await categoryWrite(client, tenant, req.body);
      afterCommit(() => {
        void refresh(tenant.slug).catch(() => {});
      });
      res.json({ success: true, data: { ...req.body, id: categoryId } });
    }),
  );
}
