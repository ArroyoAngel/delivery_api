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
import { CouponsService } from '../coupons/coupons.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EventsGateway } from '../events/events.gateway';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(OrderEntity) private orders: Repository<OrderEntity>,
    private dataSource: DataSource,
    private deliveryGroups: DeliveryGroupsService,
    private notifications: NotificationsService,
    private cfg: SystemConfigService,
    private coupons: CouponsService,
    private eventEmitter: EventEmitter2,
    private events: EventsGateway,
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

  private async resolveShopForAccount(
    accountId: string,
  ): Promise<{ id: string; name: string; serviceCategory: string }> {
    let [shop] = await this.dataSource.query(
      `SELECT s.id, s.name, COALESCE(bt.service_category, 'food') AS "serviceCategory"
       FROM shops s
       LEFT JOIN business_types bt ON bt.value = s.business_type
       WHERE s.owner_account_id = $1
       LIMIT 1`,
      [accountId],
    );

    if (!shop) {
      [shop] = await this.dataSource.query(
        `SELECT s.id, s.name, COALESCE(bt.service_category, 'food') AS "serviceCategory"
         FROM shops s
         LEFT JOIN business_types bt ON bt.value = s.business_type
         JOIN admins a ON a.shop_id = s.id
         JOIN profiles p ON p.id = a.profile_id
         WHERE p.account_id = $1
         LIMIT 1`,
        [accountId],
      );
    }

    if (!shop)
      throw new NotFoundException('No tenés un negocio asignado');
    return shop;
  }

  private async getPlatformServiceFee(): Promise<number> {
    return 0; // El cobro por servicio fue eliminado. La plataforma cobra via créditos del rider.
  }

  private async getPlatformDeliveryFees(): Promise<{ delivery: number; express: number }> {
    const [delivery, express] = await Promise.all([
      this.cfg.getNumber('delivery_fee', 5),
      this.cfg.getNumber('express_fee', 5),
    ]);
    return { delivery, express };
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
        const [shop] = await this.dataSource.query(
          'SELECT name FROM shops WHERE id = $1',
          [o.shopId],
        );
        return { ...o, items, shopName: shop?.name ?? '' };
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

    // Admin/staff que no sea superadmin: verificar que la orden pertenezca a su negocio
    const isSuperAdmin = roles.some((r) =>
      ['superadmin', 'super_admin'].includes(r),
    );
    if (isElevated && !isSuperAdmin) {
      const [hasAccess] = await this.dataSource.query(
        `SELECT 1 FROM shops r
         WHERE r.id = $1
           AND (
             r.owner_account_id = $2
             OR EXISTS (
               SELECT 1 FROM admins a
               JOIN profiles p ON p.id = a.profile_id
               WHERE p.account_id = $2 AND a.shop_id = r.id
             )
           )`,
        [order.shopId, userId],
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
    const [shop] = await this.dataSource.query(
      'SELECT name, address FROM shops WHERE id = $1',
      [order.shopId],
    );
    return {
      ...order,
      items,
      shopName: shop?.name ?? '',
      shopAddress: shop?.address ?? '',
    };
  }

  async create(userId: string, dto: CreateOrderDto) {
    const platformFee = await this.getPlatformServiceFee();
    const platformDeliveryFees = await this.getPlatformDeliveryFees();
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

      const shops = await em.query(
        'SELECT id, status FROM shops WHERE id = $1',
        [dto.shopId],
      );
      if (!shops.length)
        throw new NotFoundException('Negocio no encontrado');
      const shopDisabled = shops[0].status === 'disabled';
      const deliveryType = dto.deliveryType ?? 'delivery';
      if (shopDisabled && deliveryType !== 'express') {
        throw new BadRequestException(
          'Este negocio solo acepta pedidos express por el momento.',
        );
      }
      const deliveryFee =
        deliveryType === 'recogida' ? 0
        : deliveryType === 'express' ? platformDeliveryFees.express
        : platformDeliveryFees.delivery;

      // ── Cupón ──────────────────────────────────────────────────────────────
      let couponDiscount = 0;
      let couponCode: string | undefined;
      let couponAbsorbs: string | undefined;
      if (dto.couponCode) {
        const result = await this.coupons.validate(
          dto.couponCode,
          subtotal,
          deliveryFee,
          dto.shopId,
        );
        couponDiscount = result.discountAmount;
        couponCode = result.code;
        couponAbsorbs = result.absorbsCost;
        // Incrementar uso dentro de la misma transacción
        await this.coupons.incrementUsesInEm(em, result.code);
      }

      const total = subtotal + deliveryFee + platformFee - couponDiscount;

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

      const isCash = dto.paymentMethod === 'cash';
      const order = em.create(OrderEntity, {
        clientId: userId,
        shopId: dto.shopId,
        status: shopDisabled ? 'listo' : isCash ? 'confirmado' : 'pendiente',
        deliveryType,
        deliveryAddress,
        deliveryLat,
        deliveryLng,
        subtotal,
        deliveryFee,
        platformFee: deliveryType !== 'recogida' ? platformFee : 0,
        total,
        couponCode,
        couponDiscount,
        couponAbsorbs,
        orderSize,
        paymentMethod: dto.paymentMethod ?? 'qr',
        riderInstructions: shopDisabled
          ? 'Ir al negocio, pedir en caja, esperar el pedido y recoger.'
          : undefined,
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

    this.events.emitOrderUpdated();

    if (saved.deliveryType === 'express') {
      const group = await this.deliveryGroups.createGroupForOrders([saved.id]);
      // Si el negocio estaba deshabilitado la orden ya nació en 'listo' — activar grupo inmediatamente
      await this.deliveryGroups.checkAndActivateGroup(group.id);
      const paymentReference = this.buildPaymentReference('group', group.id);
      await this.createPendingPayment({
        reference: paymentReference,
        scopeType: 'group',
        groupId: group.id,
        payerAccountId: userId,
        subtotal: Number(saved.subtotal ?? 0),
        deliveryFee: Number(saved.deliveryFee ?? 0),
        platformFee: Number(saved.platformFee ?? 0),
        totalAmount: Number(saved.total ?? 0),
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
        platformFee: Number(saved.platformFee ?? 0),
        totalAmount: Number(saved.total ?? 0),
        metadata: { deliveryType: 'delivery' },
      });
      return { ...saved, paymentReference, platformFee };
    }

    return saved;
  }

  async findShopOrders(ownerId: string) {
    // Busca el negocio: primero como dueño, luego como staff asignado
    let [shop] = await this.dataSource.query(
      'SELECT id, name FROM shops WHERE owner_account_id = $1',
      [ownerId],
    );
    if (!shop) {
      [shop] = await this.dataSource.query(
        `SELECT r.id, r.name FROM shops r
         JOIN admins a ON a.shop_id = r.id
         JOIN profiles p ON p.id = a.profile_id
         WHERE p.account_id = $1
         LIMIT 1`,
        [ownerId],
      );
    }
    if (!shop)
      throw new NotFoundException('No tenés un negocio asignado');

    const rows = await this.orders.find({
      where: { shopId: shop.id },
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

    return { shop: shop.name, orders };
  }

  async getShopServiceAreas(accountId: string) {
    const shop = await this.resolveShopForAccount(accountId);

    return this.dataSource.query(
      `SELECT id, shop_id AS "shopId", name, kind, color, sort_order AS "sortOrder", is_active AS "isActive"
       FROM shop_service_areas
       WHERE shop_id = $1
       ORDER BY sort_order, created_at`,
      [shop.id],
    );
  }

  async getShopAreaKindOptions(accountId: string) {
    const shop = await this.resolveShopForAccount(accountId);
    return this.dataSource.query(
      `SELECT value, label, type, web_icon AS "webIcon", color, sort_order AS "sortOrder"
       FROM area_kind_options
       WHERE shop_id IS NULL OR shop_id = $1
       ORDER BY sort_order`,
      [shop.id],
    );
  }

  async createShopServiceArea(
    accountId: string,
    dto: CreateRestaurantServiceAreaDto,
  ) {
    const shop = await this.resolveShopForAccount(accountId);

    if (shop.serviceCategory !== 'food')
      throw new ForbiddenException('Las zonas de servicio solo aplican a negocios de tipo food');

    return this.insertServiceArea(shop.id, dto);
  }

  async getShopServiceAreasByShopId(shopId: string) {
    const [shop] = await this.dataSource.query(
      `SELECT s.id, COALESCE(bt.service_category, 'food') AS "serviceCategory"
       FROM shops s
       LEFT JOIN business_types bt ON bt.value = s.business_type
       WHERE s.id = $1`,
      [shopId],
    );
    if (!shop) throw new NotFoundException('Negocio no encontrado');

    return this.dataSource.query(
      `SELECT id, shop_id AS "shopId", name, kind, color, sort_order AS "sortOrder", is_active AS "isActive"
       FROM shop_service_areas
       WHERE shop_id = $1
       ORDER BY sort_order, created_at`,
      [shopId],
    );
  }

  async createShopServiceAreaForShop(
    shopId: string,
    dto: CreateRestaurantServiceAreaDto,
  ) {
    const [shop] = await this.dataSource.query(
      `SELECT s.id, COALESCE(bt.service_category, 'food') AS "serviceCategory"
       FROM shops s
       LEFT JOIN business_types bt ON bt.value = s.business_type
       WHERE s.id = $1`,
      [shopId],
    );
    if (!shop) throw new NotFoundException('Negocio no encontrado');

    if (shop.serviceCategory !== 'food')
      throw new ForbiddenException('Las zonas de servicio solo aplican a negocios de tipo food');

    return this.insertServiceArea(shopId, dto);
  }

  private async insertServiceArea(shopId: string, dto: CreateRestaurantServiceAreaDto) {
    const [row] = await this.dataSource.query(
      `INSERT INTO shop_service_areas (shop_id, name, kind, color, sort_order)
       VALUES (
         $1,
         $2,
         COALESCE($3, 'mesa'),
         COALESCE($4, '#f97316'),
         (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM shop_service_areas WHERE shop_id = $1)
       )
       RETURNING id, shop_id AS "shopId", name, kind, color, sort_order AS "sortOrder", is_active AS "isActive"`,
      [shopId, dto.name, dto.kind || null, dto.color || null],
    );
    return row;
  }

  async createShopLocalCashOrder(
    accountId: string,
    dto: CreateRestaurantLocalOrderDto,
  ) {
    if (!dto.items?.length)
      throw new BadRequestException('Debes incluir al menos un item');

    const shop = await this.resolveShopForAccount(accountId);

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
           WHERE id = $1 AND shop_id = $2`,
          [item.menuItemId, shop.id],
        );
        if (!rows.length)
          throw new NotFoundException(
            `Item ${item.menuItemId} no encontrado en tu negocio`,
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
        shopId: shop.id,
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
            channel: 'shop_local_cash',
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
      .notifyShopNewOrder(saved.shopId, saved.id)
      .catch(() => null);
    this.events.emitOrderUpdated();

    return {
      ...saved,
      workflow: 'shop_local_cash',
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

        const shops = await em.query(
          'SELECT delivery_fee, status FROM shops WHERE id = $1',
          [restaurantOrder.shopId],
        );
        if (!shops.length)
          throw new NotFoundException('Negocio no encontrado');
        const shopDisabled = shops[0].status === 'disabled';
        const deliveryFee = Number(shops[0].delivery_fee) * 2; // express = ×2
        const total = subtotal + deliveryFee;

        const isCash = dto.paymentMethod === 'cash';
        const order = em.create(OrderEntity, {
          clientId: userId,
          shopId: restaurantOrder.shopId,
          status: shopDisabled ? 'listo' : isCash ? 'confirmado' : 'pendiente',
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
          paymentMethod: dto.paymentMethod ?? 'qr',
          riderInstructions: shopDisabled
            ? 'Ir al negocio, pedir en caja, esperar el pedido y recoger.'
            : undefined,
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
    // Si algún negocio estaba deshabilitado sus órdenes ya nacieron en 'listo' — activar grupo inmediatamente
    await this.deliveryGroups.checkAndActivateGroup(group.id);
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
      `SELECT id, subtotal, delivery_fee, platform_fee, total_amount FROM payments WHERE group_id = $1 ORDER BY requested_at DESC LIMIT 1`,
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
      (o) => !['cancelado', 'entregado', 'confirmado', 'preparando', 'listo', 'en_camino'].includes(o.status),
    );
    for (const o of unpaid) {
      await this.orders.update(o.id, { status: 'confirmado' });
      this.notifications
        .notifyShopNewOrder(o.shopId, o.id)
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

    // Distribuir fondos por cada orden del grupo
    if (paymentRow) {
      const orderCount = orders.length || 1;
      // Prorratear subtotal y fees entre las órdenes del grupo
      for (const o of orders) {
        const orderSubtotal = Number(o.subtotal);
        const orderDeliveryFee = Number(o.deliveryFee);
        const orderPlatformFee = Number(o.platformFee);
        const perOrderPayment = {
          ...paymentRow,
          subtotal: orderSubtotal || Number(paymentRow.subtotal) / orderCount,
          delivery_fee: orderDeliveryFee || Number(paymentRow.delivery_fee) / orderCount,
          platform_fee: orderPlatformFee || Number(paymentRow.platform_fee) / orderCount,
        };
        await this._distributePayment(o.id, o.shopId, perOrderPayment);
      }
    }

    this.eventEmitter.emit('payment.confirmed', {
      groupId,
      clientId: orders[0]?.clientId,
      total: groupTotal,
    });

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
    this.events.emitOrderUpdated();
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

  async riderCancelOrder(riderId: string, orderId: string, reason: string) {
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Orden no encontrada');

    const cancellable = ['confirmado', 'listo', 'en_camino'];
    if (!cancellable.includes(order.status)) {
      throw new ForbiddenException(
        `No se puede cancelar una orden con estado '${order.status}'`,
      );
    }

    // Si la orden pertenece a un grupo, verificar que el rider sea el asignado
    if (order.groupId) {
      const [grp] = await this.dataSource.query(
        `SELECT dg.rider_id FROM delivery_groups dg
         JOIN profiles p ON p.id = dg.rider_id
         WHERE dg.id = $1`,
        [order.groupId],
      );
      // Buscar el account_id del rider para comparar
      const [riderRow] = await this.dataSource.query(
        `SELECT p.account_id FROM delivery_groups dg
         JOIN riders r ON r.id = dg.rider_id
         JOIN profiles p ON p.id = r.profile_id
         WHERE dg.id = $1`,
        [order.groupId],
      );
      if (riderRow && riderRow.account_id !== riderId) {
        throw new ForbiddenException('No tenés acceso a esta orden');
      }
    }

    await this.orders.update(orderId, {
      status: 'cancelado',
      cancelReason: reason || null,
    });

    // Notificar al cliente
    const [shop] = await this.dataSource.query(
      'SELECT name FROM shops WHERE id = $1',
      [order.shopId],
    );
    this.notifications
      .notifyClientOrderCancelled(order.clientId, reason, shop?.name ?? '')
      .catch(() => {});

    return { id: orderId, status: 'cancelado' };
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
      `SELECT id, subtotal, delivery_fee, platform_fee, total_amount
       FROM payments WHERE order_id = $1 ORDER BY requested_at DESC LIMIT 1`,
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
      .notifyShopNewOrder(order.shopId, orderId)
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
    // ── Distribución de fondos ──────────────────────────────────────────────
    await this._distributePayment(orderId, order.shopId, paymentRow);

    this.eventEmitter.emit('payment.confirmed', {
      orderId,
      clientId: order.clientId,
      total: targetTotal,
    });

    return {
      id: orderId,
      status: 'confirmado',
      paidAt: new Date().toISOString(),
      total: targetTotal,
    };
  }

  /**
   * Crea los registros de wallet_transactions para distribuir el pago entre
   * restaurante, plataforma y (pendiente) repartidor.
   *
   * Estructura:
   *   subtotal  → restaurante (menos comisión)
   *   platform_fee (cargo de servicio + comisión sobre subtotal) → plataforma
   *   delivery_fee → plataforma con status 'pending_rider'
   *                  (se transferirá al repartidor al entregar)
   */
  private async _distributePayment(
    orderId: string,
    shopId: string,
    payment: any,
  ): Promise<void> {
    if (!payment) return;

    const commissionPct = await this.cfg.getNumber('shop_commission_pct', 0);
    const subtotal = Number(payment.subtotal ?? 0);
    const deliveryFee = Number(payment.delivery_fee ?? 0);
    const platformFeeBase = Number(payment.platform_fee ?? 0);
    const paymentId = payment.id;

    // Recuperar datos del cupón de la orden para ajustar distribución
    const [orderRow] = await this.dataSource.query(
      `SELECT coupon_discount, coupon_absorbs FROM orders WHERE id = $1`,
      [orderId],
    );
    const couponDiscount = Number(orderRow?.coupon_discount ?? 0);
    const couponAbsorbs = orderRow?.coupon_absorbs ?? null;

    const commission = subtotal * commissionPct / 100;
    // Si el negocio absorbe el cupón, se descuenta de su crédito
    const shopCouponDeduction = couponAbsorbs === 'shop' ? couponDiscount : 0;
    const restaurantAmount = Math.max(0, subtotal - commission - shopCouponDeduction);
    const platformAmount = platformFeeBase + commission;

    // Persistir commission_amount en la orden para historial
    await this.dataSource.query(
      `UPDATE orders SET commission_amount = $1 WHERE id = $2`,
      [commission, orderId],
    );

    // ── Negocio ─────────────────────────────────────────────────────────
    if (restaurantAmount > 0) {
      await this.dataSource.query(
        `INSERT INTO wallet_transactions
           (owner_type, owner_id, payment_id, order_id, entry_type, amount, status, description)
         VALUES ('shop', $1, $2, $3, 'credit', $4, 'confirmed',
                 'Venta confirmada')`,
        [shopId, paymentId, orderId, restaurantAmount],
      );
    }

    // ── Plataforma (cargo de servicio + comisión) ────────────────────────────
    const [superadmin] = await this.dataSource.query(
      `SELECT id FROM accounts WHERE 'superadmin' = ANY(roles) LIMIT 1`,
    );
    const platformOwnerId = superadmin?.id ?? '00000000-0000-0000-0000-000000000000';

    if (platformAmount > 0) {
      await this.dataSource.query(
        `INSERT INTO wallet_transactions
           (owner_type, owner_id, payment_id, order_id, entry_type, amount, status, description)
         VALUES ('platform', $1, $2, $3, 'credit', $4, 'confirmed',
                 'Cargo de servicio')`,
        [platformOwnerId, paymentId, orderId, platformAmount],
      );
    }

    // ── Delivery (pendiente de asignación a repartidor) ──────────────────────
    if (deliveryFee > 0) {
      await this.dataSource.query(
        `INSERT INTO wallet_transactions
           (owner_type, owner_id, payment_id, order_id, entry_type, amount, status, description)
         VALUES ('platform', $1, $2, $3, 'credit', $4, 'pending_rider',
                 'Fee de delivery — pendiente de repartidor')`,
        [platformOwnerId, paymentId, orderId, deliveryFee],
      );
    }
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
        r.name AS shop_name,
        p.first_name, p.last_name
      FROM orders o
      LEFT JOIN shops r ON r.id = o.shop_id
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
          shopId: o.shop_id,
          shopName: o.shop_name ?? '',
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
