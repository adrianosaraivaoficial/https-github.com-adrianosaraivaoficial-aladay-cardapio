import { z } from 'zod';

export const OrderItemDtoSchema = z.object({
  productId: z.string().min(1),
  productName: z.string().min(1),
  quantity: z.number().int().positive('Quantidade deve ser pelo menos 1'),
  unitPriceCents: z.number().int().nonnegative('Preço unitário em centavos não pode ser negativo'),
  totalPriceCents: z.number().int().nonnegative(),
  notes: z.string().optional(),
});
export type OrderItemDto = z.infer<typeof OrderItemDtoSchema>;

export const OrderStatusEnum = z.enum([
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'dispatched',
  'delivered',
  'cancelled',
]);
export type OrderStatus = z.infer<typeof OrderStatusEnum>;

export const CreateOrderDtoSchema = z.object({
  tenantSlug: z.string().min(2),
  customerName: z.string().trim().min(2, 'Nome do cliente é obrigatório'),
  customerPhone: z.string().trim().min(8, 'Telefone do cliente é obrigatório'),
  orderType: z.enum(['dine_in', 'delivery', 'takeaway']).default('delivery'),
  deliveryAddress: z.string().optional(),
  tableNumber: z.string().optional(),
  paymentMethod: z.enum(['pix', 'credit_card', 'debit_card', 'cash']),
  items: z.array(OrderItemDtoSchema).min(1, 'Pedido deve conter pelo menos 1 item'),
  deliveryFeeCents: z.number().int().nonnegative().default(0),
  discountCents: z.number().int().nonnegative().default(0),
  notes: z.string().optional(),
});
export type CreateOrderDto = z.input<typeof CreateOrderDtoSchema>;

export const UpdateOrderStatusDtoSchema = z.object({
  status: OrderStatusEnum,
  cancellationReason: z.string().optional(),
});
export type UpdateOrderStatusDto = z.infer<typeof UpdateOrderStatusDtoSchema>;
