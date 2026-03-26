import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { RatingEntity } from './entities/rating.entity';

export interface SubmitRatingDto {
  orderId: string;
  targetType: 'shop' | 'rider' | 'client';
  targetAccountId?: string;
  targetShopId?: string;
  score: number;
  comment?: string;
}

export interface PendingItem {
  targetType: string;
  targetId: string;
  name: string;
}

@Injectable()
export class RatingsService {
  constructor(
    @InjectRepository(RatingEntity)
    private readonly ratings: Repository<RatingEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async submit(raterAccountId: string, dto: SubmitRatingDto) {
    if (dto.score < 1 || dto.score > 5) {
      throw new ForbiddenException('El puntaje debe ser entre 1 y 5');
    }

    const [order] = await this.dataSource.query(
      `SELECT id, client_id, rider_id, shop_id, group_id, status FROM orders WHERE id = $1`,
      [dto.orderId],
    );
    if (!order) throw new NotFoundException('Pedido no encontrado');
    if (order.status !== 'entregado') {
      throw new ForbiddenException('Solo podés calificar pedidos entregados');
    }

    // Verificar que el calificador tiene relación con el pedido
    if (dto.targetType === 'client') {
      const [rider] = await this.dataSource.query(
        `SELECT ri.id FROM riders ri
         JOIN profiles pr ON pr.id = ri.profile_id
         WHERE pr.account_id = $1`,
        [raterAccountId],
      );
      if (!rider || order.rider_id !== rider.id) {
        throw new ForbiddenException(
          'Solo el repartidor del pedido puede calificar al cliente',
        );
      }
    } else {
      if (order.client_id !== raterAccountId) {
        throw new ForbiddenException(
          'Solo el cliente del pedido puede calificar',
        );
      }
    }

    // Evitar duplicados — ignorar silenciosamente si ya fue calificado
    const existing = await this.ratings.findOne({
      where: { orderId: dto.orderId, raterAccountId, targetType: dto.targetType },
    });
    if (existing) return { success: true };

    const rating = this.ratings.create({
      orderId: dto.orderId,
      groupId: order.group_id ?? null,
      raterAccountId,
      targetType: dto.targetType,
      targetAccountId: dto.targetAccountId ?? null,
      targetShopId: dto.targetShopId ?? null,
      score: dto.score,
      comment: dto.comment ?? null,
    });
    await this.ratings.save(rating);

    // Recalcular promedio del shop
    if (dto.targetType === 'shop' && dto.targetShopId) {
      await this.dataSource.query(
        `UPDATE shops
         SET rating = (
           SELECT ROUND(AVG(score)::numeric, 1)
           FROM ratings
           WHERE target_shop_id = $1 AND target_type = 'shop'
         )
         WHERE id = $1`,
        [dto.targetShopId],
      );
    }

    return { success: true };
  }

  /** Devuelve qué ratings pendientes tiene el usuario en un pedido específico */
  async getPending(accountId: string, orderId: string) {
    const [order] = await this.dataSource.query(
      `SELECT o.id, o.client_id, o.rider_id, o.shop_id, o.status,
              s.name  AS shop_name,
              pr.first_name  AS rider_first,
              pr.last_name   AS rider_last,
              pc.first_name  AS client_first,
              pc.last_name   AS client_last
       FROM orders o
       JOIN shops s ON s.id = o.shop_id
       LEFT JOIN riders ri ON ri.id = o.rider_id
       LEFT JOIN profiles pr ON pr.id = ri.profile_id
       LEFT JOIN profiles pc ON pc.account_id = o.client_id
       WHERE o.id = $1`,
      [orderId],
    );

    if (!order || order.status !== 'entregado') return { pending: [] };

    const pending = await this._buildPendingForOrder(accountId, order);
    return { pending };
  }

  /** Devuelve todas las órdenes recientes con calificaciones pendientes para el usuario */
  async getMyPendingOrders(accountId: string) {
    const orders = await this.dataSource.query(
      `SELECT o.id, o.client_id, o.rider_id, o.shop_id, o.status,
              s.name AS shop_name,
              pr.first_name AS rider_first, pr.last_name AS rider_last,
              pc.first_name AS client_first, pc.last_name AS client_last
       FROM orders o
       JOIN shops s ON s.id = o.shop_id
       LEFT JOIN riders ri ON ri.id = o.rider_id
       LEFT JOIN profiles pr ON pr.id = ri.profile_id
       LEFT JOIN profiles pc ON pc.account_id = o.client_id
       WHERE o.status = 'entregado'
         AND (
           o.client_id = $1
           OR EXISTS (
             SELECT 1 FROM riders r2
             JOIN profiles p2 ON p2.id = r2.profile_id
             WHERE p2.account_id = $1 AND r2.id = o.rider_id
           )
         )
         AND o.updated_at > NOW() - INTERVAL '7 days'
       ORDER BY o.updated_at DESC
       LIMIT 10`,
      [accountId],
    );

    const result: { orderId: string; pending: PendingItem[] }[] = [];
    for (const order of orders) {
      const pending = await this._buildPendingForOrder(accountId, order);
      if (pending.length > 0) {
        result.push({ orderId: order.id, pending });
      }
    }
    return result;
  }

  private async _buildPendingForOrder(
    accountId: string,
    order: any,
  ): Promise<PendingItem[]> {
    const orderId = order.id;
    const pending: PendingItem[] = [];

    const alreadyRated = async (targetType: string) => {
      const [row] = await this.dataSource.query(
        `SELECT id FROM ratings WHERE order_id=$1 AND rater_account_id=$2 AND target_type=$3`,
        [orderId, accountId, targetType],
      );
      return !!row;
    };

    const isClient = order.client_id === accountId;
    const [riderRow] = await this.dataSource.query(
      `SELECT ri.id FROM riders ri JOIN profiles pr ON pr.id = ri.profile_id WHERE pr.account_id = $1`,
      [accountId],
    );
    const isRider = riderRow && order.rider_id === riderRow.id;

    if (isClient) {
      if (!(await alreadyRated('shop'))) {
        pending.push({
          targetType: 'shop',
          targetId: order.shop_id,
          name: order.shop_name,
        });
      }
      if (order.rider_id && !(await alreadyRated('rider'))) {
        const [riderAccount] = await this.dataSource.query(
          `SELECT pr.account_id FROM riders ri JOIN profiles pr ON pr.id = ri.profile_id WHERE ri.id = $1`,
          [order.rider_id],
        );
        if (riderAccount) {
          const name =
            [order.rider_first, order.rider_last].filter(Boolean).join(' ') ||
            'Repartidor';
          pending.push({
            targetType: 'rider',
            targetId: riderAccount.account_id,
            name,
          });
        }
      }
    }

    if (isRider && !(await alreadyRated('client'))) {
      const name =
        [order.client_first, order.client_last].filter(Boolean).join(' ') ||
        'Cliente';
      pending.push({ targetType: 'client', targetId: order.client_id, name });
    }

    return pending;
  }
}
