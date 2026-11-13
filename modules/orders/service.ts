import type { OrderRepository, OrderEntity } from './repository.ts';
import type { CreateOrderDto, UpdateOrderStatusDto, OrderStatus } from './validation.ts';
import type { ServiceResult } from '../common/types.ts';

export class OrderService {
  constructor(private repository: OrderRepository) {}

  calculatePrices(dto: CreateOrderDto): { subtotalCents: number; totalCents: number } {
    const subtotalCents = dto.items.reduce((sum, item) => {
      const lineTotal = Math.max(0, item.unitPriceCents) * Math.max(1, item.quantity);
      return sum + lineTotal;
    }, 0);

    const deliveryFeeCents = Math.max(0, dto.deliveryFeeCents || 0);
    const discountCents = Math.max(0, dto.discountCents || 0);
    const totalCents = Math.max(0, subtotalCents + deliveryFeeCents - discountCents);

    return { subtotalCents, totalCents };
  }

  async createOrder(dto: CreateOrderDto): Promise<ServiceResult<OrderEntity>> {
    const { subtotalCents, totalCents } = this.calculatePrices(dto);

    const outboxPayload = {
      tenantSlug: dto.tenantSlug,
      customerPhone: dto.customerPhone,
      customerName: dto.customerName,
      totalCents,
      paymentMethod: dto.paymentMethod,
    };

    const order = await this.repository.createTransactionalOrder(
      {
        tenantSlug: dto.tenantSlug,
        customerName: dto.customerName,
        customerPhone: dto.customerPhone,
        orderType: dto.orderType || 'delivery',
        deliveryAddress: dto.deliveryAddress,
        tableNumber: dto.tableNumber,
        paymentMethod: dto.paymentMethod,
        paymentStatus: dto.paymentMethod === 'pix' ? 'pending' : 'pending',
        items: dto.items,
        subtotalCents,
        deliveryFeeCents: dto.deliveryFeeCents || 0,
        discountCents: dto.discountCents || 0,
        totalCents,
        status: 'pending',
        notes: dto.notes,
      },
      {
        eventType: 'OrderCreated',
        payload: outboxPayload,
      },
    );

    return { success: true, data: order, statusCode: 201 };
  }

  async getOrder(orderId: string, tenantSlug?: string): Promise<ServiceResult<OrderEntity>> {
    const order = await this.repository.findById(orderId, tenantSlug);
    if (!order) {
      return { success: false, error: 'Pedido não encontrado ou acesso não autorizado.', statusCode: 404 };
    }
    return { success: true, data: order };
  }

  async listTenantOrders(tenantSlug: string): Promise<ServiceResult<OrderEntity[]>> {
    const orders = await this.repository.listByTenant(tenantSlug);
    return { success: true, data: orders };
  }

  async updateOrderStatus(
    orderId: string,
    dto: UpdateOrderStatusDto,
    tenantSlug?: string,
  ): Promise<ServiceResult<OrderEntity>> {
    const order = await this.repository.findById(orderId, tenantSlug);
    if (!order) {
      return { success: false, error: 'Pedido não encontrado ou acesso negado para este tenant.', statusCode: 404 };
    }

    // State machine check
    if (order.status === 'cancelled' && dto.status !== 'cancelled') {
      return { success: false, error: 'Pedidos cancelados não podem ser alterados.', statusCode: 400 };
    }

    const updated = await this.repository.updateStatus(orderId, dto.status, tenantSlug);
    if (!updated) {
      return { success: false, error: 'Falha ao atualizar status do pedido.', statusCode: 500 };
    }

    return { success: true, data: updated };
  }
}
