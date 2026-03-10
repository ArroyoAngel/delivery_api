import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { OrderEntity } from './entities/order.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { DeliveryGroupsService } from '../delivery-groups/delivery-groups.service';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(OrderEntity) private orders: Repository<OrderEntity>,
    private dataSource: DataSource,
    private deliveryGroups: DeliveryGroupsService,
  ) {}

  async findMyOrders(userId: string) {
    const rows = await this.orders.find({ where: { clientId: userId }, order: { createdAt: 'DESC' } });
    return Promise.all(
      rows.map(async (o) => {
        const items = await this.dataSource.query(
          `SELECT oi.*, mi.name AS item_name, mi.image_url
           FROM order_items oi
           JOIN menu_items mi ON mi.id = oi.menu_item_id
           WHERE oi.order_id = $1`,
          [o.id],
        );
        const [restaurant] = await this.dataSource.query(
          'SELECT name FROM restaurants WHERE id = $1',
          [o.restaurantId],
        );
        return { ...o, items, restaurantName: restaurant?.name ?? '' };
      }),
    );
  }

  async findOne(userId: string, orderId: string) {
    const order = await this.orders.findOne({ where: { id: orderId, clientId: userId } });
    if (!order) throw new NotFoundException('Orden no encontrada');
    const items = await this.dataSource.query(
      `SELECT oi.*, mi.name AS item_name, mi.image_url, mi.description
       FROM order_items oi JOIN menu_items mi ON mi.id = oi.menu_item_id
       WHERE oi.order_id = $1`,
      [orderId],
    );
    const [restaurant] = await this.dataSource.query(
      'SELECT name, address FROM restaurants WHERE id = $1',
      [order.restaurantId],
    );
    return { ...order, items, restaurantName: restaurant?.name ?? '', restaurantAddress: restaurant?.address ?? '' };
  }

  async create(userId: string, dto: CreateOrderDto) {
    return this.dataSource.transaction(async (em) => {
      let subtotal = 0;
      const validatedItems: { menuItemId: string; quantity: number; unitPrice: number; notes?: string }[] = [];

      let orderSize = 0;
      for (const item of dto.items) {
        const rows = await em.query(
          'SELECT id, price, is_available, COALESCE(size, 1) AS size FROM menu_items WHERE id = $1',
          [item.menuItemId],
        );
        if (!rows.length) throw new NotFoundException(`Item ${item.menuItemId} no encontrado`);
        if (!rows[0].is_available) throw new BadRequestException(`Item no disponible`);
        const unitPrice = Number(rows[0].price);
        subtotal += unitPrice * item.quantity;
        orderSize += Number(rows[0].size) * item.quantity;
        validatedItems.push({ menuItemId: item.menuItemId, quantity: item.quantity, unitPrice, notes: item.notes });
      }

      const restaurants = await em.query('SELECT delivery_fee FROM restaurants WHERE id = $1', [dto.restaurantId]);
      if (!restaurants.length) throw new NotFoundException('Restaurante no encontrado');
      const deliveryType = dto.deliveryType ?? 'delivery';
      const deliveryFee = deliveryType === 'recogida' ? 0 : Number(restaurants[0].delivery_fee);
      const total = subtotal + deliveryFee;

      // Si es delivery y no se envió dirección, usar la dirección principal del cliente
      let deliveryAddress = dto.deliveryAddress ?? undefined;
      let deliveryLat: number | undefined = undefined;
      let deliveryLng: number | undefined = undefined;
      if (deliveryType !== 'recogida' && !deliveryAddress) {
        const [defaultAddr] = await em.query(
          `SELECT street, number, floor, latitude, longitude FROM user_addresses
           WHERE user_id = $1 AND is_default = true LIMIT 1`,
          [userId],
        );
        if (defaultAddr) {
          deliveryAddress = [defaultAddr.street, defaultAddr.number, defaultAddr.floor]
            .filter(Boolean)
            .join(', ');
          deliveryLat = defaultAddr.latitude ? Number(defaultAddr.latitude) : undefined;
          deliveryLng = defaultAddr.longitude ? Number(defaultAddr.longitude) : undefined;
        }
      }

      const order = em.create(OrderEntity, {
        clientId: userId,
        restaurantId: dto.restaurantId,
        status: 'pendiente',
        deliveryType,
        deliveryAddress,
        deliveryLat,
        deliveryLng,
        deliveryFee,
        total,
        orderSize,
        notes: dto.notes,
      });
      const saved = await em.save(OrderEntity, order);

      for (const item of validatedItems) {
        await em.query(
          'INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, notes) VALUES ($1,$2,$3,$4,$5)',
          [saved.id, item.menuItemId, item.quantity, item.unitPrice, item.notes ?? null],
        );
      }
      return saved;
    });
  }

  async findRestaurantOrders(ownerId: string) {
    // Busca el restaurante del dueño
    const [restaurant] = await this.dataSource.query(
      'SELECT id, name FROM restaurants WHERE owner_id = $1',
      [ownerId],
    );
    if (!restaurant) throw new NotFoundException('No tenés un restaurante asignado');

    const rows = await this.orders.find({
      where: { restaurantId: restaurant.id },
      order: { createdAt: 'DESC' },
    });

    const orders = await Promise.all(
      rows.map(async (o) => {
        const items = await this.dataSource.query(
          `SELECT oi.quantity, oi.unit_price, mi.name AS item_name
           FROM order_items oi JOIN menu_items mi ON mi.id = oi.menu_item_id
           WHERE oi.order_id = $1`,
          [o.id],
        );
        const [client] = await this.dataSource.query(
          'SELECT first_name, last_name, phone FROM users WHERE id = $1',
          [o.clientId],
        );
        return {
          ...o,
          items,
          clientName: client ? `${client.first_name} ${client.last_name}` : '',
          clientPhone: client?.phone ?? '',
        };
      }),
    );

    return { restaurant: restaurant.name, orders };
  }

  async updateStatus(orderId: string, status: string) {
    const allowed = ['pendiente', 'confirmado', 'preparando', 'listo', 'en_camino', 'entregado', 'cancelado'];
    if (!allowed.includes(status)) throw new BadRequestException(`Estado inválido: ${status}`);
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Orden no encontrada');
    await this.orders.update(orderId, { status });
    // Si se marca como listo, intentar armar grupo automáticamente
    if (status === 'listo') {
      const newGroups = await this.deliveryGroups.tryGroupOrders();
      return { id: orderId, status, groupsCreated: newGroups.length };
    }
    return { id: orderId, status };
  }

  async cancelOrder(userId: string, orderId: string) {
    const order = await this.orders.findOne({ where: { id: orderId, clientId: userId } });
    if (!order) throw new NotFoundException('Orden no encontrada');
    if (['entregado', 'cancelado'].includes(order.status)) {
      throw new ForbiddenException(`No se puede cancelar una orden con estado '${order.status}'`);
    }
    await this.orders.update(orderId, { status: 'cancelado' });
    return { id: orderId, status: 'cancelado' };
  }

  async confirmPayment(orderId: string, paidAmount?: number) {
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Orden no encontrada');
    if (['cancelado', 'entregado'].includes(order.status)) {
      throw new ForbiddenException(`No se puede confirmar pago para orden con estado '${order.status}'`);
    }
    if (paidAmount !== undefined && paidAmount < Number(order.total)) {
      throw new BadRequestException(
        `Monto insuficiente: se requieren Bs ${order.total}, recibido Bs ${paidAmount}`,
      );
    }
    await this.orders.update(orderId, { status: 'confirmado' });
    return { id: orderId, status: 'confirmado', paidAt: new Date().toISOString(), total: order.total };
  }
}
