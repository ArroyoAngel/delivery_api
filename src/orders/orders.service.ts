import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { OrderEntity } from './entities/order.entity';
import {
  CreateOrderDto,
  ExpressCheckoutDto,
  CreateRestaurantLocalOrderDto,
  CreateRestaurantServiceAreaDto,
} from './dto/create-order.dto';
import { DeliveryGroupsService } from '../delivery-groups/delivery-groups.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SystemConfigService } from '../system-config/system-config.service';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(OrderEntity) private orders: Repository<OrderEntity>,
    private dataSource: DataSource,
    private deliveryGroups: DeliveryGroupsService,
    private notifications: NotificationsService,
    private cfg: SystemConfigService,
  ) {}

  private readonly effectiveStatuses = [
    'confirmado',
    'preparando',
    'listo',
    'en_camino',
    'entregado',
  ];

  private buildPaymentReference(scope: 'order' | 'group', id: string): string {
    const prefix = scope === 'group' ? 'GRP' : 'ORD';
    return `${prefix}_${id.replace(/-/g, '').toUpperCase()}`;
  }

  private async resolveRestaurantForAccount(
    accountId: string,
  ): Promise<{ id: string; name: string }> {
    let [restaurant] = await this.dataSource.query(
      `SELECT id, name
       FROM restaurants
       WHERE owner_account_id = $1
       LIMIT 1`,
      [accountId],
    );

    if (!restaurant) {
      [restaurant] = await this.dataSource.query(
        `SELECT r.id, r.name
         FROM restaurants r
         JOIN admins a ON a.restaurant_id = r.id
         JOIN profiles p ON p.id = a.profile_id
         WHERE p.account_id = $1
         LIMIT 1`,
        [accountId],
      );
    }

    if (!restaurant)
      throw new NotFoundException('No tenés un restaurante asignado');
    return restaurant;
  }

  private async ensureDefaultServiceAreas(restaurantId: string): Promise<void> {
    const [existing] = await this.dataSource.query(
      `SELECT 1 FROM restaurant_service_areas WHERE restaurant_id = $1 LIMIT 1`,
      [restaurantId],
    );
    if (existing) return;

    const defaults: Array<[string, string, string, number]> = [
      ['Mesas salón', 'mesa', '#f97316', 1],
      ['Barra', 'barra', '#0ea5e9', 2],
      ['Terraza', 'terraza', '#22c55e', 3],
      ['Recojo en tienda', 'salon', '#a855f7', 4],
    ];

    for (const [name, kind, color, sortOrder] of defaults) {
      await this.dataSource.query(
        `INSERT INTO restaurant_service_areas (restaurant_id, name, kind, color, sort_order)
         VALUES ($1, $2, $3, $4, $5)`,
        [restaurantId, name, kind, color, sortOrder],
      );
    }
  }

  private async getPlatformServiceFee(): Promise<number> {
    const fee = await this.cfg.getNumber('platform_service_fee', 0);
    return Number.isFinite(fee) && fee > 0 ? fee : 0;
  }

  private async createPendingPayment(params: {
    reference: string;
    scopeType: 'order' | 'group';
    payerAccountId: string;
    subtotal: number;
    deliveryFee: number;
    platformFee: number;
    totalAmount: number;
    orderId?: string;
    groupId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO payments (
          reference, scope_type, order_id, group_id, payer_account_id,
          subtotal, delivery_fee, platform_fee, total_amount, metadata
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
       ON CONFLICT (reference) DO UPDATE SET
          subtotal = EXCLUDED.subtotal,
          delivery_fee = EXCLUDED.delivery_fee,
          platform_fee = EXCLUDED.platform_fee,
          total_amount = EXCLUDED.total_amount,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()`,
      [
        params.reference,
        params.scopeType,
        params.orderId ?? null,
        params.groupId ?? null,
        params.payerAccountId,
        params.subtotal,
        params.deliveryFee,
        params.platformFee,
        params.totalAmount,
        JSON.stringify(params.metadata ?? {}),
      ],
    );
  }

  async findMyOrders(userId: string) {
    const rows = await this.orders.find({
      where: { clientId: userId },
      order: { createdAt: 'DESC' },
    });
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

  async findOne(userId: string, orderId: string, roles: string[] = []) {
    const isElevated = roles.some((r) => ['admin', 'superadmin'].includes(r));

    // Clientes solo ven sus propias órdenes; roles elevados ven cualquiera
    const where: any = isElevated
      ? { id: orderId }
      : { id: orderId, clientId: userId };
    const order = await this.orders.findOne({ where });
    if (!order) throw new NotFoundException('Orden no encontrada');

    // Admin/staff que no sea superadmin: verificar que la orden pertenezca a su restaurante
    const isSuperAdmin = roles.some((r) =>
      ['superadmin', 'super_admin'].includes(r),
    );
    if (isElevated && !isSuperAdmin) {
      const [hasAccess] = await this.dataSource.query(
        `SELECT 1 FROM restaurants r
         WHERE r.id = $1
           AND (
             r.owner_account_id = $2
             OR EXISTS (
               SELECT 1 FROM admins a
               JOIN profiles p ON p.id = a.profile_id
               WHERE p.account_id = $2 AND a.restaurant_id = r.id
             )
           )`,
        [order.restaurantId, userId],
      );
      if (!hasAccess)
        throw new ForbiddenException('No tenés acceso a esta orden');
    }

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
    return {
      ...order,
      items,
      restaurantName: restaurant?.name ?? '',
      restaurantAddress: restaurant?.address ?? '',
    };
  }

  async create(userId: string, dto: CreateOrderDto) {
    const platformFee = await this.getPlatformServiceFee();
    const saved = await this.dataSource.transaction(async (em) => {
      let subtotal = 0;
      const validatedItems: {
        menuItemId: string;
        quantity: number;
        unitPrice: number;
        notes?: string;
      }[] = [];

      let orderSize = 0;
      for (const item of dto.items) {
        const rows = await em.query(
          'SELECT id, price, is_available, COALESCE(size, 1) AS size, stock, daily_limit, daily_sold FROM menu_items WHERE id = $1',
          [item.menuItemId],
        );
        if (!rows.length)
          throw new NotFoundException(`Item ${item.menuItemId} no encontrado`);
        const mi = rows[0];
        if (!mi.is_available)
          throw new BadRequestException(`Item no disponible`);
        // Stock check
        if (mi.stock !== null && mi.stock !== undefined) {
          if (Number(mi.stock) < item.quantity)
            throw new BadRequestException(`Stock insuficiente para el item`);
        }
        // Daily limit check
        if (mi.daily_limit !== null && mi.daily_limit !== undefined) {
          const remaining = Number(mi.daily_limit) - Number(mi.daily_sold ?? 0);
          if (remaining < item.quantity)
            throw new BadRequestException(
              `Límite diario alcanzado para el item`,
            );
        }
        const unitPrice = Number(mi.price);
        subtotal += unitPrice * item.quantity;
        orderSize += Number(mi.size) * item.quantity;
        validatedItems.push({
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          unitPrice,
          notes: item.notes,
        });
      }

      const restaurants = await em.query(
        'SELECT delivery_fee FROM restaurants WHERE id = $1',
        [dto.restaurantId],
      );
      if (!restaurants.length)
        throw new NotFoundException('Restaurante no encontrado');
      const deliveryType = dto.deliveryType ?? 'delivery';
      const baseFee =
        deliveryType === 'recogida' ? 0 : Number(restaurants[0].delivery_fee);
      const deliveryFee = deliveryType === 'express' ? baseFee * 2 : baseFee;
      const total = subtotal + deliveryFee;

      // Si es delivery y no se envió dirección, usar la dirección principal del cliente
      let deliveryAddress = dto.deliveryAddress ?? undefined;
      let deliveryLat: number | undefined = dto.deliveryLat ?? undefined;
      let deliveryLng: number | undefined = dto.deliveryLng ?? undefined;
      if (deliveryType !== 'recogida' && !deliveryAddress) {
        const [defaultAddr] = await em.query(
          `SELECT street, number, floor, latitude, longitude FROM user_addresses
           WHERE account_id = $1 AND is_default = true LIMIT 1`,
          [userId],
        );
        if (defaultAddr) {
          deliveryAddress = [
            defaultAddr.street,
            defaultAddr.number,
            defaultAddr.floor,
          ]
            .filter(Boolean)
            .join(', ');
          deliveryLat = defaultAddr.latitude
            ? Number(defaultAddr.latitude)
            : undefined;
          deliveryLng = defaultAddr.longitude
            ? Number(defaultAddr.longitude)
            : undefined;
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
        subtotal,
        deliveryFee,
        platformFee: deliveryType === 'delivery' ? platformFee : 0,
        total,
        orderSize,
        notes: dto.notes,
      });
      const saved = await em.save(OrderEntity, order);

      for (const item of validatedItems) {
        await em.query(
          'INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, notes) VALUES ($1,$2,$3,$4,$5)',
          [
            saved.id,
            item.menuItemId,
            item.quantity,
            item.unitPrice,
            item.notes ?? null,
          ],
        );
        // Decrement stock and daily_sold; auto-disable if stock reaches 0 or daily_limit reached
        await em.query(
          `UPDATE menu_items SET
            stock       = CASE WHEN stock IS NOT NULL THEN stock - $2 ELSE stock END,
            daily_sold  = daily_sold + $2,
            is_available = CASE
              WHEN stock IS NOT NULL AND (stock - $2) <= 0 THEN false
              WHEN daily_limit IS NOT NULL AND (daily_sold + $2) >= daily_limit THEN false
              ELSE is_available
            END
          WHERE id = $1`,
          [item.menuItemId, item.quantity],
        );
      }
      return saved;
    });

    if (saved.deliveryType === 'express') {
      const group = await this.deliveryGroups.createGroupForOrders([saved.id]);
      const paymentReference = this.buildPaymentReference('group', group.id);
      await this.createPendingPayment({
        reference: paymentReference,
        scopeType: 'group',
        groupId: group.id,
        payerAccountId: userId,
        subtotal: Number(saved.subtotal ?? 0),
        deliveryFee: Number(saved.deliveryFee ?? 0),
        platformFee,
        totalAmount: Number(saved.total ?? 0) + platformFee,
        metadata: { deliveryType: 'express', orderIds: [saved.id] },
      });
      return { ...saved, groupId: group.id, paymentReference };
    }

    if (saved.deliveryType === 'delivery') {
      const paymentReference = this.buildPaymentReference('order', saved.id);
      await this.orders.update(saved.id, { paymentReference });
      await this.createPendingPayment({
        reference: paymentReference,
        scopeType: 'order',
        orderId: saved.id,
        payerAccountId: userId,
        subtotal: Number(saved.subtotal ?? 0),
        deliveryFee: Number(saved.deliveryFee ?? 0),
        platformFee,
        totalAmount: Number(saved.total ?? 0) + platformFee,
        metadata: { deliveryType: 'delivery' },
      });
      return { ...saved, paymentReference, platformFee };
    }

    return saved;
  }

  async findRestaurantOrders(ownerId: string) {
    // Busca el restaurante: primero como dueño, luego como staff asignado
    let [restaurant] = await this.dataSource.query(
      'SELECT id, name FROM restaurants WHERE owner_account_id = $1',
      [ownerId],
    );
    if (!restaurant) {
      [restaurant] = await this.dataSource.query(
        `SELECT r.id, r.name FROM restaurants r
         JOIN admins a ON a.restaurant_id = r.id
         JOIN profiles p ON p.id = a.profile_id
         WHERE p.account_id = $1
         LIMIT 1`,
        [ownerId],
      );
    }
    if (!restaurant)
      throw new NotFoundException('No tenés un restaurante asignado');

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
          `SELECT p.first_name, p.last_name, p.phone
           FROM accounts a LEFT JOIN profiles p ON p.account_id = a.id
           WHERE a.id = $1`,
          [o.clientId],
        );
        return {
          ...o,
          items,
          clientName: client
            ? `${client.first_name ?? ''} ${client.last_name ?? ''}`.trim()
            : '',
          clientPhone: client?.phone ?? '',
        };
      }),
    );

    return { restaurant: restaurant.name, orders };
  }

  async getRestaurantServiceAreas(accountId: string) {
    const restaurant = await this.resolveRestaurantForAccount(accountId);
    await this.ensureDefaultServiceAreas(restaurant.id);

    return this.dataSource.query(
      `SELECT id, restaurant_id AS "restaurantId", name, kind, color, sort_order AS "sortOrder", is_active AS "isActive"
       FROM restaurant_service_areas
       WHERE restaurant_id = $1
       ORDER BY sort_order, created_at`,
      [restaurant.id],
    );
  }

  async createRestaurantServiceArea(
    accountId: string,
    dto: CreateRestaurantServiceAreaDto,
  ) {
    const restaurant = await this.resolveRestaurantForAccount(accountId);

    const [row] = await this.dataSource.query(
      `INSERT INTO restaurant_service_areas (restaurant_id, name, kind, color, sort_order)
       VALUES (
         $1,
         $2,
         COALESCE($3, 'mesa'),
         COALESCE($4, '#f97316'),
         (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM restaurant_service_areas WHERE restaurant_id = $1)
       )
       RETURNING id, restaurant_id AS "restaurantId", name, kind, color, sort_order AS "sortOrder", is_active AS "isActive"`,
      [restaurant.id, dto.name, dto.kind ?? null, dto.color ?? null],
    );

    return row;
  }

  async createRestaurantLocalCashOrder(
    accountId: string,
    dto: CreateRestaurantLocalOrderDto,
  ) {
    if (!dto.items?.length)
      throw new BadRequestException('Debes incluir al menos un item');

    const restaurant = await this.resolveRestaurantForAccount(accountId);

    const saved = await this.dataSource.transaction(async (em) => {
      let subtotal = 0;
      let orderSize = 0;
      const validatedItems: {
        menuItemId: string;
        quantity: number;
        unitPrice: number;
        notes?: string;
      }[] = [];

      for (const item of dto.items) {
        const rows = await em.query(
          `SELECT id, price, is_available, COALESCE(size, 1) AS size, stock, daily_limit, daily_sold
           FROM menu_items
           WHERE id = $1 AND restaurant_id = $2`,
          [item.menuItemId, restaurant.id],
        );
        if (!rows.length)
          throw new NotFoundException(
            `Item ${item.menuItemId} no encontrado en tu restaurante`,
          );

        const mi = rows[0];
        if (!mi.is_available)
          throw new BadRequestException('Item no disponible');
        if (
          mi.stock !== null &&
          mi.stock !== undefined &&
          Number(mi.stock) < item.quantity
        ) {
          throw new BadRequestException('Stock insuficiente para el item');
        }
        if (mi.daily_limit !== null && mi.daily_limit !== undefined) {
          const remaining = Number(mi.daily_limit) - Number(mi.daily_sold ?? 0);
          if (remaining < item.quantity)
            throw new BadRequestException(
              'Límite diario alcanzado para el item',
            );
        }

        const unitPrice = Number(mi.price);
        subtotal += unitPrice * item.quantity;
        orderSize += Number(mi.size) * item.quantity;
        validatedItems.push({
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          unitPrice,
          notes: item.notes,
        });
      }

      const serviceType = dto.serviceType ?? 'local';
      const isPickup = serviceType === 'recogida';
      const areaText = dto.areaLabel?.trim() || 'Sin área';
      const composedNotes = [
        dto.notes?.trim(),
        `Canal: ${isPickup ? 'Recojo en tienda' : 'Consumo en local'}`,
        `Área/Mesa: ${areaText}`,
        'Pago: Efectivo',
      ]
        .filter(Boolean)
        .join(' | ');

      const order = em.create(OrderEntity, {
        clientId: accountId,
        restaurantId: restaurant.id,
        status: 'confirmado',
        deliveryType: 'recogida',
        deliveryAddress: isPickup
          ? 'Recojo en tienda'
          : `Consumo en local · ${areaText}`,
        subtotal,
        deliveryFee: 0,
        platformFee: 0,
        total: subtotal,
        orderSize,
        notes: composedNotes,
      });

      const persisted = await em.save(OrderEntity, order);

      for (const item of validatedItems) {
        await em.query(
          'INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, notes) VALUES ($1,$2,$3,$4,$5)',
          [
            persisted.id,
            item.menuItemId,
            item.quantity,
            item.unitPrice,
            item.notes ?? null,
          ],
        );
        await em.query(
          `UPDATE menu_items SET
            stock       = CASE WHEN stock IS NOT NULL THEN stock - $2 ELSE stock END,
            daily_sold  = daily_sold + $2,
            is_available = CASE
              WHEN stock IS NOT NULL AND (stock - $2) <= 0 THEN false
              WHEN daily_limit IS NOT NULL AND (daily_sold + $2) >= daily_limit THEN false
              ELSE is_available
            END
          WHERE id = $1`,
          [item.menuItemId, item.quantity],
        );
      }

      const paymentReference = `${this.buildPaymentReference('order', persisted.id)}_CASH`;
      await em.query(
        `INSERT INTO payments (
          reference, scope_type, order_id, payer_account_id,
          status, subtotal, delivery_fee, platform_fee, total_amount,
          bank_provider, confirmed_at, metadata
        ) VALUES (
          $1, 'order', $2, $3,
          'confirmed', $4, 0, 0, $4,
          'cash', NOW(), $5::jsonb
        )
        ON CONFLICT (reference) DO NOTHING`,
        [
          paymentReference,
          persisted.id,
          accountId,
          subtotal,
          JSON.stringify({
            channel: 'restaurant_local_cash',
            serviceType,
            areaId: dto.areaId ?? null,
            areaLabel: areaText,
          }),
        ],
      );

      await em.update(OrderEntity, persisted.id, { paymentReference });

      return { ...persisted, paymentReference };
    });

    this.notifications
      .notifyRestaurantNewOrder(saved.restaurantId, saved.id)
      .catch(() => null);

    return {
      ...saved,
      workflow: 'restaurant_local_cash',
      effectiveStatuses: this.effectiveStatuses,
    };
  }

  async expressCheckout(userId: string, dto: ExpressCheckoutDto) {
    const orderIds: string[] = [];
    let grandTotal = 0;
    const createdOrders: OrderEntity[] = [];
    const groupPlatformFee = await this.getPlatformServiceFee();

    for (const restaurantOrder of dto.orders) {
      const saved = await this.dataSource.transaction(async (em) => {
        let subtotal = 0;
        let orderSize = 0;
        const validatedItems: {
          menuItemId: string;
          quantity: number;
          unitPrice: number;
          notes?: string;
        }[] = [];

        for (const item of restaurantOrder.items) {
          const rows = await em.query(
            'SELECT id, price, is_available, COALESCE(size, 1) AS size, stock, daily_limit, daily_sold FROM menu_items WHERE id = $1',
            [item.menuItemId],
          );
          if (!rows.length)
            throw new NotFoundException(
              `Item ${item.menuItemId} no encontrado`,
            );
          const mi = rows[0];
          if (!mi.is_available)
            throw new BadRequestException(`Item no disponible`);
          if (mi.stock !== null && Number(mi.stock) < item.quantity)
            throw new BadRequestException(`Stock insuficiente para el item`);
          if (
            mi.daily_limit !== null &&
            Number(mi.daily_limit) - Number(mi.daily_sold ?? 0) < item.quantity
          )
            throw new BadRequestException(
              `Límite diario alcanzado para el item`,
            );
          const unitPrice = Number(mi.price);
          subtotal += unitPrice * item.quantity;
          orderSize += Number(mi.size) * item.quantity;
          validatedItems.push({
            menuItemId: item.menuItemId,
            quantity: item.quantity,
            unitPrice,
            notes: item.notes,
          });
        }

        const restaurants = await em.query(
          'SELECT delivery_fee FROM restaurants WHERE id = $1',
          [restaurantOrder.restaurantId],
        );
        if (!restaurants.length)
          throw new NotFoundException('Restaurante no encontrado');
        const deliveryFee = Number(restaurants[0].delivery_fee) * 2; // express = ×2
        const total = subtotal + deliveryFee;

        const order = em.create(OrderEntity, {
          clientId: userId,
          restaurantId: restaurantOrder.restaurantId,
          status: 'pendiente',
          deliveryType: 'express',
          deliveryAddress: dto.deliveryAddress,
          deliveryLat: dto.deliveryLat,
          deliveryLng: dto.deliveryLng,
          subtotal,
          deliveryFee,
          platformFee: 0,
          total,
          orderSize,
          notes: restaurantOrder.notes,
        });
        const s = await em.save(OrderEntity, order);
        for (const item of validatedItems) {
          await em.query(
            'INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, notes) VALUES ($1,$2,$3,$4,$5)',
            [
              s.id,
              item.menuItemId,
              item.quantity,
              item.unitPrice,
              item.notes ?? null,
            ],
          );
          await em.query(
            `UPDATE menu_items SET
              stock       = CASE WHEN stock IS NOT NULL THEN stock - $2 ELSE stock END,
              daily_sold  = daily_sold + $2,
              is_available = CASE
                WHEN stock IS NOT NULL AND (stock - $2) <= 0 THEN false
                WHEN daily_limit IS NOT NULL AND (daily_sold + $2) >= daily_limit THEN false
                ELSE is_available
              END
            WHERE id = $1`,
            [item.menuItemId, item.quantity],
          );
        }
        return s;
      });
      orderIds.push(saved.id);
      grandTotal += Number(saved.total);
      createdOrders.push(saved);
    }

    const group = await this.deliveryGroups.createGroupForOrders(orderIds);
    const paymentReference = this.buildPaymentReference('group', group.id);
    await this.createPendingPayment({
      reference: paymentReference,
      scopeType: 'group',
      groupId: group.id,
      payerAccountId: userId,
      subtotal: createdOrders.reduce(
        (sum, order) => sum + Number(order.subtotal ?? 0),
        0,
      ),
      deliveryFee: createdOrders.reduce(
        (sum, order) => sum + Number(order.deliveryFee ?? 0),
        0,
      ),
      platformFee: groupPlatformFee,
      totalAmount: grandTotal + groupPlatformFee,
      metadata: { deliveryType: 'express', orderIds },
    });
    return {
      groupId: group.id,
      total: grandTotal + groupPlatformFee,
      orders: createdOrders,
      paymentReference,
    };
  }

  async confirmGroupPayment(
    groupId: string,
    paidAmount?: number,
    reference?: string,
    bankProvider?: string,
    metadata?: Record<string, unknown>,
  ) {
    const orders = await this.orders.find({ where: { groupId } });
    if (!orders.length)
      throw new NotFoundException('Grupo no encontrado o sin órdenes');
    const [paymentRow] = await this.dataSource.query(
      `SELECT id, total_amount FROM payments WHERE group_id = $1 ORDER BY requested_at DESC LIMIT 1`,
      [groupId],
    );
    const groupTotal = paymentRow
      ? Number(paymentRow.total_amount)
      : orders.reduce((s, o) => s + Number(o.total), 0);
    if (paidAmount !== undefined && paidAmount < groupTotal) {
      throw new BadRequestException(
        `Monto insuficiente: se requieren Bs ${groupTotal.toFixed(2)}, recibido Bs ${paidAmount}`,
      );
    }
    const unpaid = orders.filter(
      (o) => !['cancelado', 'entregado', 'confirmado'].includes(o.status),
    );
    for (const o of unpaid) {
      await this.orders.update(o.id, { status: 'confirmado' });
      this.notifications
        .notifyRestaurantNewOrder(o.restaurantId, o.id)
        .catch(() => null);
    }
    await this.dataSource.query(
      `UPDATE payments
       SET status = 'confirmed',
           bank_provider = COALESCE($2, bank_provider),
           confirmed_at = COALESCE(confirmed_at, NOW()),
           metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb,
           updated_at = NOW()
       WHERE group_id = $1`,
      [
        groupId,
        bankProvider ?? null,
        JSON.stringify({ reference, ...(metadata ?? {}) }),
      ],
    );
    return {
      groupId,
      status: 'confirmado',
      total: groupTotal,
      orderCount: orders.length,
    };
  }

  async updateStatus(orderId: string, status: string) {
    const allowed = [
      'pendiente',
      'confirmado',
      'preparando',
      'listo',
      'en_camino',
      'entregado',
      'cancelado',
    ];
    if (!allowed.includes(status))
      throw new BadRequestException(`Estado inválido: ${status}`);
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Orden no encontrada');
    await this.orders.update(orderId, { status });
    if (status === 'listo') {
      if (order.groupId) {
        await this.deliveryGroups.checkAndActivateGroup(order.groupId);
        return { id: orderId, status, groupsCreated: 0 };
      }
      const newGroups = await this.deliveryGroups.tryGroupOrders();
      return { id: orderId, status, groupsCreated: newGroups.length };
    }
    return { id: orderId, status };
  }

  async cancelOrder(userId: string, orderId: string) {
    const order = await this.orders.findOne({
      where: { id: orderId, clientId: userId },
    });
    if (!order) throw new NotFoundException('Orden no encontrada');
    if (order.status !== 'pendiente') {
      throw new ForbiddenException(
        `No se puede cancelar una orden con estado '${order.status}'`,
      );
    }
    await this.orders.update(orderId, { status: 'cancelado' });
    return { id: orderId, status: 'cancelado' };
  }

  async confirmPayment(
    orderId: string,
    paidAmount?: number,
    reference?: string,
    bankProvider?: string,
    metadata?: Record<string, unknown>,
  ) {
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Orden no encontrada');
    if (['cancelado', 'entregado'].includes(order.status)) {
      throw new ForbiddenException(
        `No se puede confirmar pago para orden con estado '${order.status}'`,
      );
    }
    const [paymentRow] = await this.dataSource.query(
      `SELECT total_amount FROM payments WHERE order_id = $1 ORDER BY requested_at DESC LIMIT 1`,
      [orderId],
    );
    const targetTotal = paymentRow
      ? Number(paymentRow.total_amount)
      : Number(order.total);
    if (paidAmount !== undefined && paidAmount < targetTotal) {
      throw new BadRequestException(
        `Monto insuficiente: se requieren Bs ${targetTotal}, recibido Bs ${paidAmount}`,
      );
    }
    await this.orders.update(orderId, { status: 'confirmado' });
    this.notifications
      .notifyRestaurantNewOrder(order.restaurantId, orderId)
      .catch(() => null);
    await this.dataSource.query(
      `UPDATE payments
       SET status = 'confirmed',
           bank_provider = COALESCE($2, bank_provider),
           confirmed_at = COALESCE(confirmed_at, NOW()),
           metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb,
           updated_at = NOW()
       WHERE order_id = $1`,
      [
        orderId,
        bankProvider ?? null,
        JSON.stringify({ reference, ...(metadata ?? {}) }),
      ],
    );
    return {
      id: orderId,
      status: 'confirmado',
      paidAt: new Date().toISOString(),
      total: targetTotal,
    };
  }

  async confirmPaymentByReference(
    reference: string,
    paidAmount?: number,
    bankTransactionId?: string,
    bankProvider?: string,
    metadata?: Record<string, unknown>,
  ) {
    const [payment] = await this.dataSource.query(
      `SELECT * FROM payments WHERE reference = $1 LIMIT 1`,
      [reference],
    );
    if (!payment) throw new NotFoundException('Pago no encontrado');

    const result =
      payment.scope_type === 'group'
        ? await this.confirmGroupPayment(
            payment.group_id,
            paidAmount,
            reference,
            bankProvider,
            metadata,
          )
        : await this.confirmPayment(
            payment.order_id,
            paidAmount,
            reference,
            bankProvider,
            metadata,
          );

    await this.dataSource.query(
      `UPDATE payments
       SET bank_transaction_id = COALESCE($2, bank_transaction_id),
           bank_provider = COALESCE($3, bank_provider),
           updated_at = NOW()
       WHERE id = $1`,
      [payment.id, bankTransactionId ?? null, bankProvider ?? null],
    );

    return { reference, ...result };
  }

  async findAllOrders() {
    const rows = await this.dataSource.query(`
      SELECT
        o.*,
        r.name AS restaurant_name,
        p.first_name, p.last_name
      FROM orders o
      LEFT JOIN restaurants r ON r.id = o.restaurant_id
      LEFT JOIN accounts a ON a.id = o.client_id
      LEFT JOIN profiles p ON p.account_id = a.id
      ORDER BY o.created_at DESC
    `);
    return Promise.all(
      rows.map(async (o: any) => {
        const items = await this.dataSource.query(
          `SELECT oi.quantity, oi.unit_price, mi.name AS item_name
           FROM order_items oi JOIN menu_items mi ON mi.id = oi.menu_item_id
           WHERE oi.order_id = $1`,
          [o.id],
        );
        return {
          id: o.id,
          clientId: o.client_id,
          restaurantId: o.restaurant_id,
          restaurantName: o.restaurant_name ?? '',
          clientName: `${o.first_name ?? ''} ${o.last_name ?? ''}`.trim(),
          status: o.status,
          subtotal: Number(o.subtotal ?? 0),
          total: Number(o.total),
          deliveryFee: Number(o.delivery_fee),
          platformFee: Number(o.platform_fee ?? 0),
          paymentReference: o.payment_reference,
          deliveryType: o.delivery_type,
          deliveryAddress: o.delivery_address,
          deliveryLat: o.delivery_lat ? Number(o.delivery_lat) : null,
          deliveryLng: o.delivery_lng ? Number(o.delivery_lng) : null,
          notes: o.notes,
          createdAt: o.created_at,
          items,
        };
      }),
    );
  }

  async getAdminStats() {
    const rows = await this.dataSource.query(`
      SELECT
        COUNT(*)::int                                                                     AS total,
        COUNT(CASE WHEN DATE(created_at AT TIME ZONE 'America/La_Paz') = CURRENT_DATE THEN 1 END)::int AS orders_today,
        COALESCE(SUM(CASE WHEN DATE(created_at AT TIME ZONE 'America/La_Paz') = CURRENT_DATE
          AND status IN ('confirmado','preparando','listo','en_camino','entregado')
          THEN total ELSE 0 END), 0)::numeric                                            AS revenue_today,
        COUNT(CASE WHEN delivery_type = 'delivery' THEN 1 END)::int                      AS delivery_count,
        COUNT(CASE WHEN delivery_type = 'recogida' THEN 1 END)::int                      AS recogida_count,
        COUNT(CASE WHEN delivery_type = 'express'  THEN 1 END)::int                      AS express_count,
        COUNT(CASE WHEN status = 'pendiente'   THEN 1 END)::int                          AS s_pendiente,
        COUNT(CASE WHEN status = 'confirmado'  THEN 1 END)::int                          AS s_confirmado,
        COUNT(CASE WHEN status = 'preparando'  THEN 1 END)::int                          AS s_preparando,
        COUNT(CASE WHEN status = 'listo'       THEN 1 END)::int                          AS s_listo,
        COUNT(CASE WHEN status = 'en_camino'   THEN 1 END)::int                          AS s_en_camino,
        COUNT(CASE WHEN status = 'entregado'   THEN 1 END)::int                          AS s_entregado,
        COUNT(CASE WHEN status = 'cancelado'   THEN 1 END)::int                          AS s_cancelado
      FROM orders
    `);
    const r = rows[0];
    return {
      total: r.total,
      ordersToday: r.orders_today,
      revenueToday: Number(r.revenue_today),
      byType: [
        { type: 'Delivery', count: r.delivery_count },
        { type: 'Recogida', count: r.recogida_count },
        { type: 'Express', count: r.express_count },
      ],
      byStatus: [
        { status: 'Pendiente', count: r.s_pendiente },
        { status: 'Confirmado', count: r.s_confirmado },
        { status: 'Preparando', count: r.s_preparando },
        { status: 'Listo', count: r.s_listo },
        { status: 'En camino', count: r.s_en_camino },
        { status: 'Entregado', count: r.s_entregado },
        { status: 'Cancelado', count: r.s_cancelado },
      ].filter((s) => s.count > 0),
    };
  }
}
