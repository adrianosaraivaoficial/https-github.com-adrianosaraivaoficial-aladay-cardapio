import { z } from 'zod';

export const CategoryDtoSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(2, 'Nome da categoria deve ter pelo menos 2 caracteres'),
  order: z.number().int().nonnegative().default(0),
  icon: z.string().optional(),
});
export type CategoryDto = z.infer<typeof CategoryDtoSchema>;

export const ProductDtoSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(2, 'Nome do produto deve ter pelo menos 2 caracteres'),
  description: z.string().default(''),
  priceCents: z.number().int().nonnegative('Preço em centavos deve ser maior ou igual a zero'),
  categoryId: z.string().min(1, 'Categoria é obrigatória'),
  imageUrl: z.string().optional(),
  available: z.boolean().default(true),
  preparationTimeMinutes: z.number().int().positive().optional(),
});
export type ProductDto = z.infer<typeof ProductDtoSchema>;

export const CatalogPartitionDtoSchema = z.object({
  tenantSlug: z.string().min(2),
  categories: z.array(CategoryDtoSchema),
  products: z.array(ProductDtoSchema),
});
export type CatalogPartitionDto = z.infer<typeof CatalogPartitionDtoSchema>;
