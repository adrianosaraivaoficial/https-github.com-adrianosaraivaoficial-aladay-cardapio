import type { Pool } from 'pg';
import type { CategoryDto, ProductDto } from './validation.ts';

export class CatalogRepository {
  private inMemoryCatalogs: Map<string, { categories: CategoryDto[]; products: ProductDto[] }> = new Map();

  constructor(private pool?: Pool | null) {
    // Seed default Brasas Burger catalog
    this.inMemoryCatalogs.set('brasas-burger', {
      categories: [
        { id: 'cat_burgers', name: 'Burgers Artesanais', order: 1, icon: 'Flame' },
        { id: 'cat_drinks', name: 'Bebidas Geladas', order: 2, icon: 'Wine' },
      ],
      products: [
        {
          id: 'prod_smash_01',
          name: 'Duplo Smash Cheddar Bacon',
          description: 'Dois blends ultra-smashed 90g, queijo cheddar inglês derretido, bacon artesanal crocante e maionese defumada.',
          priceCents: 3490,
          categoryId: 'cat_burgers',
          imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80',
          available: true,
          preparationTimeMinutes: 15,
        },
        {
          id: 'prod_drink_coca',
          name: 'Coca-Cola Original 350ml',
          description: 'Lata trincando de gelada.',
          priceCents: 750,
          categoryId: 'cat_drinks',
          imageUrl: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600&auto=format&fit=crop&q=80',
          available: true,
        },
      ],
    });
  }

  async getCatalog(tenantSlug: string): Promise<{ categories: CategoryDto[]; products: ProductDto[] }> {
    const cleanSlug = tenantSlug.toLowerCase().trim();
    if (this.pool) {
      try {
        const catRes = await this.pool.query(
          'SELECT * FROM categories WHERE tenant_slug = $1 ORDER BY display_order ASC;',
          [cleanSlug],
        );
        const prodRes = await this.pool.query(
          'SELECT * FROM products WHERE tenant_slug = $1 ORDER BY name ASC;',
          [cleanSlug],
        );

        if (catRes.rows.length > 0 || prodRes.rows.length > 0) {
          return {
            categories: catRes.rows.map((r) => ({
              id: r.id,
              name: r.name,
              order: r.display_order,
              icon: r.icon,
            })),
            products: prodRes.rows.map((r) => ({
              id: r.id,
              name: r.name,
              description: r.description || '',
              priceCents: r.price_cents,
              categoryId: r.category_id,
              imageUrl: r.image_url,
              available: r.available,
              preparationTimeMinutes: r.preparation_time_minutes,
            })),
          };
        }
      } catch {
        // fallback
      }
    }
    return this.inMemoryCatalogs.get(cleanSlug) || { categories: [], products: [] };
  }

  async saveCatalog(tenantSlug: string, categories: CategoryDto[], products: ProductDto[]): Promise<void> {
    const cleanSlug = tenantSlug.toLowerCase().trim();
    this.inMemoryCatalogs.set(cleanSlug, { categories, products });

    if (this.pool) {
      try {
        const client = await this.pool.connect();
        try {
          await client.query('BEGIN;');
          // Delete old items for partition
          await client.query('DELETE FROM products WHERE tenant_slug = $1;', [cleanSlug]);
          await client.query('DELETE FROM categories WHERE tenant_slug = $1;', [cleanSlug]);

          for (const cat of categories) {
            await client.query(
              'INSERT INTO categories (id, tenant_slug, name, display_order, icon) VALUES ($1, $2, $3, $4, $5);',
              [cat.id, cleanSlug, cat.name, cat.order, cat.icon || null],
            );
          }

          for (const prod of products) {
            await client.query(
              `INSERT INTO products (id, tenant_slug, name, description, price_cents, category_id, image_url, available, preparation_time_minutes)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);`,
              [
                prod.id,
                cleanSlug,
                prod.name,
                prod.description,
                prod.priceCents,
                prod.categoryId,
                prod.imageUrl || null,
                prod.available,
                prod.preparationTimeMinutes || null,
              ],
            );
          }
          await client.query('COMMIT;');
        } catch (e) {
          await client.query('ROLLBACK;');
        } finally {
          client.release();
        }
      } catch {
        // fallback
      }
    }
  }
}
