import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, IsNull, LessThan } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DeliveryGroupEntity } from './entities/delivery-group.entity';
import { OrderEntity } from '../orders/entities/order.entity';
import { SystemConfigService } from '../system-config/system-config.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EventsGateway } from '../events/events.gateway';

// Fórmula Haversine: distancia en metros entre dos coordenadas
function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

@Injectable()
export class DeliveryGroupsService {
  private readonly logger = new Logger(DeliveryGroupsService.name);

  constructor(
    @InjectRepository(DeliveryGroupEntity)
    private groups: Repository<DeliveryGroupEntity>,
    @InjectRepository(OrderEntity) private orders: Repository<OrderEntity>,
    private dataSource: DataSource,
    private cfg: SystemConfigService,
    private notifications: NotificationsService,
    private events: EventsGateway,
  ) {}

  async getLocationIntervalSeconds(): Promise<number> {
    const val = await this.cfg.getNumber('location_interval_seconds', 5);
    return Math.min(Math.max(1, val), 300); // clamp 1–300 s
  }

  async saveLocationSegment(
    accountId: string,
    path: string,
    startedAt: string,
    endedAt: string,
    intervalSeconds: number,
  ) {
    if (!path) return { inserted: 0 };
    const riderId = await this.resolveRiderId(accountId);
    if (!riderId) return { inserted: 0 };
    const clamped = Math.min(Math.max(1, intervalSeconds), 300);
    await this.dataSource.query(
      `INSERT INTO rider_location_history (rider_id, path, started_at, ended_at, interval_seconds)
       VALUES ($1, $2, $3, $4, $5)`,
      [riderId, path, startedAt, endedAt, clamped],
    );
    return { inserted: 1 };
  }

  async getRiderLocationHistory(riderId: string, date: string) {
    return this.dataSource.query(
      `SELECT path, started_at AS "startedAt", ended_at AS "endedAt", interval_seconds AS "intervalSeconds"
       FROM rider_location_history
       WHERE rider_id = $1
         AND DATE(started_at AT TIME ZONE 'America/La_Paz') = $2
       ORDER BY started_at ASC`,
      [riderId, date],
    );
  }

  async getRiderLocationDates(riderId: string): Promise<string[]> {
    const rows = await this.dataSource.query(
      `SELECT DISTINCT DATE(started_at AT TIME ZONE 'America/La_Paz') AS date
       FROM rider_location_history
       WHERE rider_id = $1
       ORDER BY date DESC`,
      [riderId],
    );
    return rows.map((r: { date: string | Date }) =>
      (r.date instanceof Date ? r.date.toISOString() : String(r.date)).slice(
        0,
        10,
      ),
    );
  }

  async getRiderDeliveries(riderId: string, date?: string) {
    const params: any[] = [riderId];
    const dateClause = date
      ? `AND DATE(o.updated_at AT TIME ZONE 'America/La_Paz') = $2`
      : '';
    if (date) params.push(date);
    return this.dataSource.query(
      `SELECT o.id, o.status, o.total::numeric AS total,
              o.delivery_address AS "deliveryAddress",
              o.delivery_lat AS "deliveryLat",
              o.delivery_lng AS "deliveryLng",
              o.updated_at AS "deliveredAt",
              o.created_at AS "createdAt",
              r.name AS "shopName"
       FROM orders o
       JOIN shops r ON r.id = o.shop_id
       WHERE o.rider_id = $1 AND o.status = 'entregado'
       ${dateClause}
       ORDER BY o.updated_at DESC`,
      params,
    );
  }

  /** Resolve riders.id from accounts.id (JWT sub). Returns null if not a rider. */
  private async resolveRiderId(accountId: string): Promise<string | null> {
    const [row] = await this.dataSource.query(
      `SELECT r.id FROM riders r
       JOIN profiles p ON p.id = r.profile_id
       WHERE p.account_id = $1`,
      [accountId],
    );
    return row?.id ?? null;
  }

  private async assertShopOrderManageAccess(
    orderId: string,
    accountId: string,
  ): Promise<void> {
    const [order] = await this.dataSource.query(
      `SELECT shop_id FROM orders WHERE id = $1 LIMIT 1`,
      [orderId],
    );
    if (!order?.shop_id)
      throw new NotFoundException('Orden no encontrada');

    const [owner] = await this.dataSource.query(
      `SELECT 1
       FROM shops
       WHERE id = $1 AND owner_account_id = $2`,
      [order.shop_id, accountId],
    );
    if (owner) return;

    const [staff] = await this.dataSource.query(
      `SELECT 1
       FROM admins a
       JOIN profiles p ON p.id = a.profile_id
       WHERE a.shop_id = $1
         AND p.account_id = $2
         AND 'manage_orders' = ANY(a.granted_permissions)`,
      [order.shop_id, accountId],
    );
    if (!staff) {
      throw new ForbiddenException(
        'No tenés permisos para gestionar este pedido',
      );
    }
  }

  async getTodayStats(accountId: string) {
    const riderId = await this.resolveRiderId(accountId);
    if (!riderId) return { deliveries_today: 0, earnings_today: 0, credits: 0 };

    const [[delivered], [credits]] = await Promise.all([
      this.dataSource.query(
        `SELECT
           COUNT(*) AS deliveries_today,
           COALESCE(SUM(delivery_fee), 0) AS earnings_today
         FROM orders
         WHERE rider_id = $1
           AND status = 'entregado'
           AND updated_at::date = CURRENT_DATE`,
        [riderId],
      ),
      this.dataSource.query(
        `SELECT COALESCE(balance, 0) AS balance FROM rider_credits WHERE rider_id = $1`,
        [riderId],
      ),
    ]);

    return {
      deliveries_today: Number(delivered.deliveries_today ?? 0),
      earnings_today: Number(delivered.earnings_today ?? 0),
      credits: Number(credits?.balance ?? 0),
    };
  }

  async setAvailable(accountId: string, available: boolean) {
    await this.dataSource.query(
      `UPDATE riders r
       SET is_available = $1
       FROM profiles p
       WHERE p.id = r.profile_id
         AND p.account_id = $2`,
      [available, accountId],
    );
    this.events.emitRiderStatusChanged(accountId, available);
    return { available };
  }

  async getAllRiders() {
    return this.dataSource.query(`
      SELECT
        r.id,
        a.id               AS "accountId",
        r.vehicle_type     AS "vehicleType",
        r.is_available     AS "isAvailable",
        r.lat, r.lng,
        r.created_at       AS "createdAt",
        r.license_front_url AS "licenseFrontUrl",
        r.license_back_url  AS "licenseBackUrl",
        r.plate,
        r.policy_url       AS "policyUrl",
        r.vin,
        p.first_name    AS "firstName",
        p.last_name     AS "lastName",
        p.phone,
        p.avatar_url    AS "avatarUrl",
        a.email
      FROM riders r
      JOIN profiles p ON p.id = r.profile_id
      JOIN accounts a ON a.id = p.account_id
      ORDER BY r.is_available DESC, p.first_name
    `);
  }

  // Busca pedidos 'listo' sin grupo y los agrupa
  async tryGroupOrders(): Promise<DeliveryGroupEntity[]> {
    const maxOrders = await this.cfg.getNumber('max_orders_per_group', 3);
    const radiusMeters = await this.cfg.getNumber(
      'nearby_shop_radius_meters',
      200,
    );

    const ungrouped = await this.orders.find({
      where: { status: 'listo', groupId: IsNull() },
      order: { createdAt: 'ASC' },
    });

    if (ungrouped.length === 0) return [];

    const createdGroups: DeliveryGroupEntity[] = [];
    const assigned = new Set<string>();

    // Express orders already have a group assigned at checkout time — skip them here
    for (const o of ungrouped) {
      if (o.deliveryType === 'express') assigned.add(o.id);
    }

    // Obtenemos info de negocios para los pedidos regulares
    const shopIds = [...new Set(ungrouped.map((o) => o.shopId))];
    const shops: { id: string; latitude: number; longitude: number }[] =
      shopIds.length > 0
        ? await this.dataSource.query(
            `SELECT id, latitude, longitude FROM shops WHERE id = ANY($1)`,
            [shopIds],
          )
        : [];
    const restMap = new Map(shops.map((r) => [r.id, r]));

    for (const seed of ungrouped) {
      if (assigned.has(seed.id)) continue;

      const group: OrderEntity[] = [seed];
      assigned.add(seed.id);

      // 1. Pedidos del mismo negocio
      for (const o of ungrouped) {
        if (group.length >= maxOrders) break;
        if (assigned.has(o.id) || o.shopId !== seed.shopId)
          continue;
        group.push(o);
        assigned.add(o.id);
      }

      // 2. Si no llegamos a maxOrders, buscamos negocios cercanos
      if (group.length < maxOrders) {
        const seedRest = restMap.get(seed.shopId);
        if (seedRest) {
          for (const o of ungrouped) {
            if (group.length >= maxOrders) break;
            if (assigned.has(o.id)) continue;
            const otherRest = restMap.get(o.shopId);
            if (!otherRest) continue;
            const dist = haversineMeters(
              Number(seedRest.latitude),
              Number(seedRest.longitude),
              Number(otherRest.latitude),
              Number(otherRest.longitude),
            );
            if (dist <= radiusMeters) {
              group.push(o);
              assigned.add(o.id);
            }
          }
        }
      }

      // Solo creamos grupo si hay al menos maxOrders pedidos
      if (group.length >= maxOrders) {
        const newGroup = await this.groups.save(
          this.groups.create({ status: 'available' }),
        );
        for (const o of group) {
          await this.orders.update(o.id, { groupId: newGroup.id });
        }
        createdGroups.push(newGroup);
        this.events.emitNewDeliveryGroup(newGroup.id);
      }
    }

    return createdGroups;
  }

  async getAvailableGroups() {
    const groups = await this.groups.find({
      where: { status: 'available' },
      order: { createdAt: 'ASC' },
    });
    return Promise.all(groups.map((g) => this.enrichGroup(g)));
  }

  async getMyActiveGroup(accountId: string) {
    const riderId = await this.resolveRiderId(accountId);
    if (!riderId) return null;
    const group = await this.groups.findOne({
      where: [
        { riderId, status: 'assigned' },
        { riderId, status: 'in_progress' },
      ],
    });
    if (!group) return null;
    return this.enrichGroup(group);
  }

  async acceptGroup(accountId: string, groupId: string) {
    const riderId = await this.resolveRiderId(accountId);
    if (!riderId)
      throw new ForbiddenException('No estás registrado como repartidor');

    console.log('[acceptGroup] ========================================');
    console.log('[acceptGroup] Rider aceptando grupo. riderId:', riderId, 'groupId:', groupId);

    // Verificar que el rider tiene créditos disponibles
    const [credits] = await this.dataSource.query(
      `SELECT balance FROM rider_credits WHERE rider_id = $1`,
      [riderId],
    );
    if (!credits || Number(credits.balance) <= 0) {
      throw new ForbiddenException(
        'No tienes créditos disponibles. Recarga tu saldo para continuar aceptando pedidos.',
      );
    }

    const group = await this.groups.findOne({
      where: { id: groupId, status: 'available' },
    });
    if (!group) throw new NotFoundException('Grupo no disponible');
    const already = await this.groups.findOne({
      where: [
        { riderId, status: 'assigned' },
        { riderId, status: 'in_progress' },
      ],
    });
    if (already) throw new ForbiddenException('Ya tenés una entrega activa');

    await this.groups.update(groupId, { riderId, status: 'assigned' });
    await this.dataSource.query(
      `UPDATE orders SET rider_id = $1 WHERE group_id = $2`,
      [riderId, groupId],
    );

    // ── Transferir dinero pending_assignment a la wallet del rider ──
    console.log('[acceptGroup] 💰 Buscando wallet_transactions con status=pending_assignment...');
    const pendingTransactions = await this.dataSource.query(
      `SELECT id, payment_id, order_id, amount
       FROM wallet_transactions
       WHERE order_id IN (SELECT id FROM orders WHERE group_id = $1)
       AND status = 'pending_assignment'`,
      [groupId],
    );
    console.log('[acceptGroup] 📋 Transactions pendientes encontradas:', pendingTransactions.length, pendingTransactions);

    if (pendingTransactions.length > 0) {
      let totalAmount = 0;
      for (const tx of pendingTransactions) {
        totalAmount += Number(tx.amount);

        // Actualizar la transacción pending_assignment a confirmed con owner_id del rider
        await this.dataSource.query(
          `UPDATE wallet_transactions
           SET owner_id = $1, status = 'confirmed'
           WHERE id = $2`,
          [riderId, tx.id],
        );
        console.log('[acceptGroup] ✓ Transaction actualizada:', tx.id, 'owner_id=', riderId, 'status=confirmed');
      }

      console.log('[acceptGroup] 💵 Total transferido al rider:', totalAmount);
      console.log('[acceptGroup] ✓ Dinero transferido exitosamente');
    } else {
      console.log('[acceptGroup] ℹ️  No hay dinero pendiente para transferir');
    }

    console.log('[acceptGroup] ========================================');
    return this.enrichGroup({ ...group, riderId, status: 'assigned' });
  }

  async markOrderPickedUp(accountId: string, orderId: string) {
    const riderId = await this.resolveRiderId(accountId);
    if (!riderId) throw new ForbiddenException('No estás registrado como repartidor');
    const order = await this.orders.findOne({
      where: { id: orderId, riderId },
    });
    if (!order) throw new NotFoundException('Orden no encontrada');
    if (order.status !== 'listo')
      throw new ForbiddenException(
        `El pedido aún no está listo para recoger (estado: ${order.status})`,
      );
    await this.orders.update(orderId, { status: 'en_camino' });
    this.notifications
      .notifyClientOrderStatus(order.clientId, 'en_camino')
      .catch(() => null);
    return { id: orderId, status: 'en_camino' };
  }

  async markOrderPreparing(orderId: string, accountId: string) {
    await this.assertShopOrderManageAccess(orderId, accountId);
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Orden no encontrada');
    if (!['confirmado', 'pendiente'].includes(order.status)) {
      throw new ForbiddenException(
        `No se puede pasar a preparando desde '${order.status}'`,
      );
    }
    await this.orders.update(orderId, { status: 'preparando' });
    this.notifications
      .notifyClientOrderStatus(order.clientId, 'preparando')
      .catch(() => null);
    return { id: orderId, status: 'preparando' };
  }

  async markOrderDelivered(accountId: string, orderId: string) {
    const riderId = await this.resolveRiderId(accountId);
    if (!riderId) throw new ForbiddenException('No estás registrado como repartidor');
    const order = await this.orders.findOne({
      where: { id: orderId, riderId },
    });
    if (!order) throw new NotFoundException('Orden no encontrada');
    if (order.status === 'entregado') return { message: 'Ya entregado' };
    if (order.status !== 'en_camino')
      throw new ForbiddenException(
        'Debés recoger el pedido antes de marcarlo como entregado',
      );

    await this.orders.update(orderId, { status: 'entregado' });
    this.notifications
      .notifyClientOrderStatus(order.clientId, 'entregado')
      .catch(() => null);

    // Descontar 1 crédito del rider al completar la entrega
    await this.dataSource.query(
      `UPDATE rider_credits SET balance = GREATEST(balance - 1, 0), updated_at = NOW()
       WHERE rider_id = $1`,
      [riderId],
    );

    // Transferir delivery fee al wallet del repartidor
    if (riderId) {
      const [pendingTx] = await this.dataSource.query(
        `SELECT id, amount, payment_id
         FROM wallet_transactions
         WHERE order_id = $1 AND status = 'pending_rider'
         LIMIT 1`,
        [orderId],
      );
      if (pendingTx) {
        await this.dataSource.query(
          `UPDATE wallet_transactions SET status = 'paid_to_rider' WHERE id = $1`,
          [pendingTx.id],
        );
        await this.dataSource.query(
          `INSERT INTO wallet_transactions
             (owner_type, owner_id, payment_id, order_id, entry_type, amount, status, description)
           VALUES ('rider', $1, $2, $3, 'credit', $4, 'confirmed', 'Delivery completado')`,
          [riderId, pendingTx.payment_id, orderId, pendingTx.amount],
        );
      }
    }

    // Verificar si todos los pedidos del grupo están entregados
    if (order.groupId) {
      const pending = await this.orders.count({
        where: { groupId: order.groupId },
      });
      const delivered = await this.dataSource.query(
        `SELECT COUNT(*) FROM orders WHERE group_id = $1 AND status = 'entregado'`,
        [order.groupId],
      );
      if (Number(delivered[0].count) >= pending) {
        await this.groups.update(order.groupId, { status: 'completed' });
      } else {
        await this.groups.update(order.groupId, { status: 'in_progress' });
      }
    }

    // Notificar al rider para que actualice sus stats del día
    this.events.emitRiderOrderDelivered(accountId);

    return { id: orderId, status: 'entregado' };
  }

  /** Crea un grupo express en estado 'waiting' y vincula las órdenes dadas. */
  async createGroupForOrders(orderIds: string[]): Promise<DeliveryGroupEntity> {
    const group = await this.groups.save(
      this.groups.create({ status: 'waiting' }),
    );
    for (const id of orderIds) {
      await this.orders.update(id, { groupId: group.id });
    }
    this.logger.log(
      `Express group ${group.id} creado con ${orderIds.length} orden(es)`,
    );
    return group;
  }

  /**
   * Activa el grupo en cuanto el PRIMER restaurante marca 'listo'.
   * El rider puede salir ya hacia ese restaurante mientras el segundo sigue preparando.
   * Solo actúa si el grupo sigue en 'waiting' para evitar actualizaciones duplicadas.
   */
  async checkAndActivateGroup(groupId: string): Promise<void> {
    const group = await this.groups.findOne({ where: { id: groupId } });
    if (!group || group.status !== 'waiting') return;

    const [{ count }] = await this.dataSource.query(
      `SELECT COUNT(*) AS count FROM orders WHERE group_id = $1 AND status = 'listo'`,
      [groupId],
    );
    if (Number(count) >= 1) {
      const total = await this.orders.count({ where: { groupId } });
      await this.groups.update(groupId, { status: 'available' });
      this.logger.log(
        `Grupo ${groupId} activado: ${count}/${total} restaurantes listos`,
      );
      this.notifications
        .notifyRidersGroupAvailable(groupId, Number(count))
        .catch(() => null);
    }
  }

  async markOrderReady(orderId: string, accountId: string) {
    await this.assertShopOrderManageAccess(orderId, accountId);
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Orden no encontrada');
    if (!['preparando', 'confirmado'].includes(order.status)) {
      throw new ForbiddenException(
        `No se puede marcar como listo desde estado '${order.status}'`,
      );
    }
    await this.orders.update(orderId, { status: 'listo' });
    this.notifications
      .notifyClientOrderStatus(order.clientId, 'listo')
      .catch(() => null);
    if (order.groupId) {
      await this.checkAndActivateGroup(order.groupId);
      return { id: orderId, status: 'listo', groupsCreated: 0 };
    }
    const newGroups = await this.tryGroupOrders();
    if (newGroups.length > 0) {
      this.notifications
        .notifyRidersGroupAvailable(newGroups[0].id, 1)
        .catch(() => null);
    }
    return { id: orderId, status: 'listo', groupsCreated: newGroups.length };
  }

  // ── Estado: preparando → entregado (negocio entrega en mesa, sin rider) ──────
  async markLocalOrderDelivered(orderId: string, accountId: string) {
    await this.assertShopOrderManageAccess(orderId, accountId);
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Orden no encontrada');
    if (order.status !== 'preparando') {
      throw new ForbiddenException(
        `Solo se puede entregar desde estado 'preparando' (estado actual: ${order.status})`,
      );
    }
    const isPortalOrder =
      order.deliveryAddress?.startsWith('Consumo en local') ||
      order.deliveryAddress === 'Recojo en tienda';
    if (!isPortalOrder) {
      throw new ForbiddenException(
        'Este endpoint es solo para pedidos registrados desde el portal (consumo en local o recojo en tienda)',
      );
    }
    await this.orders.update(orderId, { status: 'entregado' });
    this.notifications
      .notifyClientOrderStatus(order.clientId, 'entregado')
      .catch(() => null);
    return { id: orderId, status: 'entregado' };
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async forceGroupExpiredOrders(): Promise<void> {
    const waitMinutes = await this.cfg.getNumber('group_wait_minutes', 5);
    const radiusMeters = await this.cfg.getNumber(
      'nearby_shop_radius_meters',
      200,
    );
    const cutoff = new Date(Date.now() - waitMinutes * 60 * 1000);

    // Intentar agrupar primero (puede que nuevos pedidos llegaron)
    await this.tryGroupOrders();

    // Pedidos que siguen sin grupo después del tiempo de espera
    const expired = await this.orders.find({
      where: {
        status: 'listo',
        groupId: IsNull(),
        updatedAt: LessThan(cutoff),
      },
      order: { createdAt: 'ASC' },
    });

    if (expired.length === 0) return;

    const shopIds2 = [...new Set(expired.map((o) => o.shopId))];
    const shops2: { id: string; latitude: number; longitude: number }[] =
      shopIds2.length > 0
        ? await this.dataSource.query(
            `SELECT id, latitude, longitude FROM shops WHERE id = ANY($1)`,
            [shopIds2],
          )
        : [];
    const restMap2 = new Map(shops2.map((r) => [r.id, r]));

    const assigned = new Set<string>();
    this.logger.log(
      `Forzando despacho de ${expired.length} pedido(s) listo con espera vencida`,
    );

    for (const seed of expired) {
      if (assigned.has(seed.id)) continue;

      const group: OrderEntity[] = [seed];
      assigned.add(seed.id);

      // 1) Mismo negocio
      for (const o of expired) {
        if (assigned.has(o.id) || o.shopId !== seed.shopId)
          continue;
        group.push(o);
        assigned.add(o.id);
      }

      // 2) Negocios cercanos (sin exigir cantidad mínima en timeout)
      const seedRest = restMap2.get(seed.shopId);
      if (seedRest) {
        for (const o of expired) {
          if (assigned.has(o.id)) continue;
          const otherRest = restMap2.get(o.shopId);
          if (!otherRest) continue;
          const dist = haversineMeters(
            Number(seedRest.latitude),
            Number(seedRest.longitude),
            Number(otherRest.latitude),
            Number(otherRest.longitude),
          );
          if (dist <= radiusMeters) {
            group.push(o);
            assigned.add(o.id);
          }
        }
      }

      const forcedGroup = await this.groups.save(
        this.groups.create({ status: 'available' }),
      );
      for (const o of group) {
        await this.orders.update(o.id, { groupId: forcedGroup.id });
      }
      this.logger.log(
        `Grupo forzado ${forcedGroup.id} creado con ${group.length} pedido(s): ${group
          .map((o) => o.id)
          .join(', ')}`,
      );
    }
  }

  private async enrichGroup(group: DeliveryGroupEntity) {
    const orders = await this.dataSource.query(
      `SELECT o.*,
              r.name AS shop_name, r.address AS shop_address,
              r.latitude AS shop_lat, r.longitude AS shop_lng,
              COALESCE(r.rating, 5) AS shop_rating,
              COALESCE((SELECT ROUND(AVG(ra.score)::numeric, 1)
               FROM ratings ra
               WHERE ra.target_account_id = o.client_id
                 AND ra.target_type = 'client'), 5) AS client_rating
       FROM orders o
       JOIN shops r ON r.id = o.shop_id
       WHERE o.group_id = $1`,
      [group.id],
    );

    const enrichedOrders = await Promise.all(
      orders.map(async (o: any) => {
        const items = await this.dataSource.query(
          `SELECT oi.quantity, oi.unit_price, mi.name AS item_name
           FROM order_items oi
           JOIN menu_items mi ON mi.id = oi.menu_item_id
           WHERE oi.order_id = $1`,
          [o.id],
        );
        return { ...o, items };
      }),
    );

    return { ...group, orders: enrichedOrders };
  }

  // ── Créditos del rider ──────────────────────────────────────────────────────

  async getRiderCredits(riderId: string) {
    const [row] = await this.dataSource.query(
      `SELECT balance, updated_at FROM rider_credits WHERE rider_id = $1`,
      [riderId],
    );
    return { riderId, balance: row ? Number(row.balance) : 0, updatedAt: row?.updated_at ?? null };
  }

  async getMyCredits(accountId: string) {
    const riderId = await this.resolveRiderId(accountId);
    if (!riderId) throw new ForbiddenException('No estás registrado como repartidor');
    return this.getRiderCredits(riderId);
  }

  async adjustRiderCredits(riderId: string, amount: number, reason?: string) {
    await this.dataSource.query(
      `INSERT INTO rider_credits (id, rider_id, balance)
       VALUES (gen_random_uuid(), $1, GREATEST($2, 0))
       ON CONFLICT (rider_id) DO UPDATE
         SET balance = GREATEST(rider_credits.balance + $2, 0),
             updated_at = NOW()`,
      [riderId, amount],
    );
    const [row] = await this.dataSource.query(
      `SELECT balance FROM rider_credits WHERE rider_id = $1`,
      [riderId],
    );
    return { riderId, balance: Number(row.balance), reason: reason ?? null };
  }
}
