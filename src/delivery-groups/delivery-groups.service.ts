import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, IsNull, LessThan } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DeliveryGroupEntity } from './entities/delivery-group.entity';
import { OrderEntity } from '../orders/entities/order.entity';
import { SystemConfigService } from '../system-config/system-config.service';

// Fórmula Haversine: distancia en metros entre dos coordenadas
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
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
    @InjectRepository(DeliveryGroupEntity) private groups: Repository<DeliveryGroupEntity>,
    @InjectRepository(OrderEntity) private orders: Repository<OrderEntity>,
    private dataSource: DataSource,
    private cfg: SystemConfigService,
  ) {}

  async getLocationIntervalSeconds(): Promise<number> {
    const val = await this.cfg.getNumber('location_interval_seconds', 5);
    return Math.min(Math.max(1, val), 300); // clamp 1–300 s
  }

  async saveLocationSegment(
    riderId: string,
    path: string,
    startedAt: string,
    endedAt: string,
    intervalSeconds: number,
  ) {
    if (!path) return { inserted: 0 };
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
      (r.date instanceof Date ? r.date.toISOString() : String(r.date)).slice(0, 10),
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
              r.name AS "restaurantName"
       FROM orders o
       JOIN restaurants r ON r.id = o.restaurant_id
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

  async getAllRiders() {
    return this.dataSource.query(`
      SELECT
        r.id,
        r.vehicle_type  AS "vehicleType",
        r.is_available  AS "isAvailable",
        r.lat, r.lng,
        r.created_at    AS "createdAt",
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
    const radiusMeters = await this.cfg.getNumber('nearby_restaurant_radius_meters', 200);

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

    // Obtenemos info de restaurantes para los pedidos regulares
    const restaurantIds = [...new Set(ungrouped.map((o) => o.restaurantId))];
    const restaurants: { id: string; latitude: number; longitude: number }[] =
      restaurantIds.length > 0
        ? await this.dataSource.query(
            `SELECT id, latitude, longitude FROM restaurants WHERE id = ANY($1)`,
            [restaurantIds],
          )
        : [];
    const restMap = new Map(restaurants.map((r) => [r.id, r]));

    for (const seed of ungrouped) {
      if (assigned.has(seed.id)) continue;

      const group: OrderEntity[] = [seed];
      assigned.add(seed.id);

      // 1. Pedidos del mismo restaurante
      for (const o of ungrouped) {
        if (group.length >= maxOrders) break;
        if (assigned.has(o.id) || o.restaurantId !== seed.restaurantId) continue;
        group.push(o);
        assigned.add(o.id);
      }

      // 2. Si no llegamos a maxOrders, buscamos restaurantes cercanos
      if (group.length < maxOrders) {
        const seedRest = restMap.get(seed.restaurantId);
        if (seedRest) {
          for (const o of ungrouped) {
            if (group.length >= maxOrders) break;
            if (assigned.has(o.id)) continue;
            const otherRest = restMap.get(o.restaurantId);
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
        const newGroup = await this.groups.save(this.groups.create({ status: 'available' }));
        for (const o of group) {
          await this.orders.update(o.id, { groupId: newGroup.id });
        }
        createdGroups.push(newGroup);
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
    if (!riderId) throw new ForbiddenException('No estás registrado como repartidor');

    const group = await this.groups.findOne({ where: { id: groupId, status: 'available' } });
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
    return this.enrichGroup({ ...group, riderId, status: 'assigned' });
  }

  async markOrderPickedUp(accountId: string, orderId: string) {
    const riderId = await this.resolveRiderId(accountId);
    const order = await this.orders.findOne({ where: { id: orderId, riderId: riderId ?? undefined } });
    if (!order) throw new NotFoundException('Orden no encontrada');
    if (order.status !== 'listo') throw new ForbiddenException(`El pedido aún no está listo para recoger (estado: ${order.status})`);
    await this.orders.update(orderId, { status: 'en_camino' });
    return { id: orderId, status: 'en_camino' };
  }

  async markOrderPreparing(orderId: string) {
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Orden no encontrada');
    if (!['confirmado', 'pendiente'].includes(order.status)) {
      throw new ForbiddenException(`No se puede pasar a preparando desde '${order.status}'`);
    }
    await this.orders.update(orderId, { status: 'preparando' });
    return { id: orderId, status: 'preparando' };
  }

  async markOrderDelivered(accountId: string, orderId: string) {
    const riderId = await this.resolveRiderId(accountId);
    const order = await this.orders.findOne({ where: { id: orderId, riderId: riderId ?? undefined } });
    if (!order) throw new NotFoundException('Orden no encontrada');
    if (order.status === 'entregado') return { message: 'Ya entregado' };
    if (order.status !== 'en_camino') throw new ForbiddenException('Debés recoger el pedido antes de marcarlo como entregado');

    await this.orders.update(orderId, { status: 'entregado' });

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

    return { id: orderId, status: 'entregado' };
  }

  /** Crea un grupo express en estado 'waiting' y vincula las órdenes dadas. */
  async createGroupForOrders(orderIds: string[]): Promise<DeliveryGroupEntity> {
    const group = await this.groups.save(this.groups.create({ status: 'waiting' }));
    for (const id of orderIds) {
      await this.orders.update(id, { groupId: group.id });
    }
    this.logger.log(`Express group ${group.id} creado con ${orderIds.length} orden(es)`);
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
      this.logger.log(`Grupo ${groupId} activado: ${count}/${total} restaurantes listos`);
    }
  }

  async markOrderReady(orderId: string) {
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Orden no encontrada');
    if (!['preparando', 'confirmado'].includes(order.status)) {
      throw new ForbiddenException(`No se puede marcar como listo desde estado '${order.status}'`);
    }
    await this.orders.update(orderId, { status: 'listo' });
    if (order.groupId) {
      await this.checkAndActivateGroup(order.groupId);
      return { id: orderId, status: 'listo', groupsCreated: 0 };
    }
    const newGroups = await this.tryGroupOrders();
    return { id: orderId, status: 'listo', groupsCreated: newGroups.length };
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async forceGroupExpiredOrders(): Promise<void> {
    const waitMinutes = await this.cfg.getNumber('group_wait_minutes', 5);
    const cutoff = new Date(Date.now() - waitMinutes * 60 * 1000);

    // Intentar agrupar primero (puede que nuevos pedidos llegaron)
    await this.tryGroupOrders();

    // Pedidos que siguen sin grupo después del tiempo de espera
    const expired = await this.orders.find({
      where: { status: 'listo', groupId: IsNull(), updatedAt: LessThan(cutoff) },
    });

    if (expired.length === 0) return;

    this.logger.log(`Forzando ${expired.length} pedido(s) a grupos individuales`);

    for (const order of expired) {
      const soloGroup = await this.groups.save(
        this.groups.create({ status: 'available' }),
      );
      await this.orders.update(order.id, { groupId: soloGroup.id });
      this.logger.log(`Orden ${order.id} enviada sola en grupo ${soloGroup.id}`);
    }
  }

  private async enrichGroup(group: DeliveryGroupEntity) {
    const orders = await this.dataSource.query(
      `SELECT o.*,
              r.name AS restaurant_name, r.address AS restaurant_address,
              r.latitude AS restaurant_lat, r.longitude AS restaurant_lng
       FROM orders o
       JOIN restaurants r ON r.id = o.restaurant_id
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
}
