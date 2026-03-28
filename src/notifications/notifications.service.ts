import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { DeviceTokenEntity } from './device-token.entity';
import { NotificationEntity } from './notification.entity';
import * as admin from 'firebase-admin';

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);
  private app: admin.app.App | null = null;

  constructor(
    @InjectRepository(DeviceTokenEntity)
    private tokens: Repository<DeviceTokenEntity>,
    @InjectRepository(NotificationEntity)
    private notifRepo: Repository<NotificationEntity>,
    private dataSource: DataSource,
  ) {}

  onModuleInit() {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      this.logger.warn(
        'Firebase credentials not configured — push notifications disabled',
      );
      return;
    }

    try {
      this.app = admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      });
      this.logger.log('Firebase Admin initialized ✓');
    } catch (e) {
      this.logger.error('Firebase Admin init error', e);
    }
  }

  // ── Token management ─────────────────────────────────────────────────────

  async registerToken(userId: string, token: string, platform = 'android') {
    await this.dataSource.query(
      `INSERT INTO device_tokens (user_id, token, platform)
       VALUES ($1, $2, $3)
       ON CONFLICT (token) DO UPDATE SET user_id = $1, platform = $3, updated_at = NOW()`,
      [userId, token, platform],
    );
  }

  async unregisterToken(token: string) {
    await this.tokens.delete({ token });
  }

  async unregisterAllForUser(userId: string) {
    await this.tokens.delete({ userId });
  }

  // ── Notification history ──────────────────────────────────────────────────

  async getUserNotifications(userId: string, limit = 30, onlyUnread = false) {
    const qb = this.notifRepo
      .createQueryBuilder('n')
      .where('n.userId = :userId', { userId })
      .orderBy('n.createdAt', 'DESC')
      .take(limit);
    if (onlyUnread) qb.andWhere('n.isRead = false');
    return qb.getMany();
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.notifRepo.count({ where: { userId, isRead: false } });
  }

  async markRead(id: string, userId: string) {
    await this.notifRepo.update({ id, userId }, { isRead: true });
  }

  async markAllRead(userId: string) {
    await this.notifRepo.update({ userId, isRead: false }, { isRead: true });
  }

  // ── Send helpers ──────────────────────────────────────────────────────────

  async sendToUser(
    userId: string,
    notification: { title: string; body: string },
    data?: Record<string, string>,
  ) {
    const rows = await this.tokens.find({ where: { userId } });
    if (!rows.length) return;
    await this._sendToTokens(
      rows.map((t) => t.token),
      notification,
      data,
    );
  }

  async sendToUsers(
    userIds: string[],
    notification: { title: string; body: string },
    data?: Record<string, string>,
  ) {
    if (!userIds.length) return;
    const rows: { token: string }[] = await this.dataSource.query(
      `SELECT token FROM device_tokens WHERE user_id = ANY($1)`,
      [userIds],
    );
    await this._sendToTokens(
      rows.map((r) => r.token),
      notification,
      data,
    );
  }

  async sendToAllRiders(
    notification: { title: string; body: string },
    data?: Record<string, string>,
  ) {
    const rows: { account_id: string }[] = await this.dataSource.query(
      `SELECT p.account_id FROM riders r JOIN profiles p ON p.id = r.profile_id`,
    );
    await this.sendToUsers(
      rows.map((r) => r.account_id),
      notification,
      data,
    );
  }

  // ── Business-event helpers ─────────────────────────────────────────────

  /** Notifica al dueño del negocio sobre un nuevo pedido confirmado */
  async notifyShopNewOrder(shopId: string, orderId: string) {
    const rows: { owner_account_id: string }[] = await this.dataSource.query(
      `SELECT owner_account_id FROM shops WHERE id = $1`,
      [shopId],
    );
    const ownerIds = rows.map((r) => r.owner_account_id).filter(Boolean);
    const notification = {
      title: '🔔 Nuevo pedido',
      body: 'Tienes un nuevo pedido esperando confirmación.',
    };
    await this._saveForUsers(ownerIds, notification, 'new_order', { orderId });
    await this.sendToUsers(ownerIds, notification, {
      orderId,
      type: 'new_order',
    });
  }

  /** Notifica al cliente sobre el cambio de estado de su pedido */
  async notifyClientOrderStatus(
    clientId: string,
    status: string,
    shopName = '',
  ) {
    const messages: Record<string, { title: string; body: string }> = {
      preparando: {
        title: '🍳 Preparando tu pedido',
        body: `${shopName || 'El negocio'} está preparando tu pedido.`,
      },
      listo: {
        title: '✅ ¡Pedido listo!',
        body: 'Tu pedido está listo y esperando al repartidor.',
      },
      en_camino: {
        title: '🛵 ¡En camino!',
        body: 'Tu repartidor ya recogió tu pedido y va hacia vos.',
      },
      entregado: {
        title: '🎉 ¡Pedido entregado!',
        body: 'Buen provecho. ¡Gracias por usar YaYa Eats!',
      },
    };

    const n = messages[status];
    if (!n) return;
    await this._saveForUsers([clientId], n, 'order_status', { status });
    await this.sendToUser(clientId, n, { type: 'order_status', status });
  }

  /** Notifica al cliente que su pedido fue cancelado por el repartidor */
  async notifyClientOrderCancelled(
    clientId: string,
    reason: string,
    shopName = '',
  ) {
    const n = {
      title: '❌ Pedido cancelado',
      body: reason
        ? `Tu pedido de ${shopName || 'YaYa Eats'} fue cancelado: ${reason}`
        : `Tu pedido de ${shopName || 'YaYa Eats'} fue cancelado por el repartidor.`,
    };
    await this._saveForUsers([clientId], n, 'order_cancelled', { reason });
    await this.sendToUser(clientId, n, { type: 'order_cancelled', reason });
  }

  /** Notifica a todos los riders disponibles que hay un grupo listo */
  async notifyRidersGroupAvailable(groupId: string, orderCount: number) {
    const notification = {
      title: '📦 Nueva entrega disponible',
      body: `Hay ${orderCount} pedido${orderCount !== 1 ? 's' : ''} listo${orderCount !== 1 ? 's' : ''} para recoger.`,
    };
    const rows: { account_id: string }[] = await this.dataSource.query(
      `SELECT p.account_id FROM riders r JOIN profiles p ON p.id = r.profile_id`,
    );
    const riderIds = rows.map((r) => r.account_id);
    await this._saveForUsers(riderIds, notification, 'group_available', {
      groupId,
    });
    await this.sendToAllRiders(notification, {
      groupId,
      type: 'group_available',
    });
  }

  // ── Internal helpers ───────────────────────────────────────────────────

  private async _saveForUsers(
    userIds: string[],
    notification: { title: string; body: string },
    type: string,
    data?: Record<string, unknown>,
  ) {
    if (!userIds.length) return;
    const records = userIds.map((userId) =>
      this.notifRepo.create({
        userId,
        title: notification.title,
        body: notification.body,
        type,
        data,
      }),
    );
    await this.notifRepo.save(records);
  }

  private async _sendToTokens(
    tokens: string[],
    notification: { title: string; body: string },
    data?: Record<string, string>,
  ) {
    if (!this.app || !tokens.length) return;

    const chunks = this._chunk(tokens, 500);
    for (const chunk of chunks) {
      try {
        const res = await this.app.messaging().sendEachForMulticast({
          tokens: chunk,
          notification,
          data: data ?? {},
          android: {
            priority: 'high',
            notification: { sound: 'default', channelId: 'yaya_orders' },
          },
          apns: {
            payload: { aps: { sound: 'default', badge: 1 } },
          },
          webpush: {
            notification: { icon: '/icons/Icon-192.png' },
          },
        });

        // Limpiar tokens inválidos automáticamente
        const invalid = chunk.filter((_, i) => {
          const r = res.responses[i];
          return (
            !r.success &&
            (r.error?.code === 'messaging/invalid-registration-token' ||
              r.error?.code === 'messaging/registration-token-not-registered')
          );
        });
        if (invalid.length) {
          await this.dataSource.query(
            `DELETE FROM device_tokens WHERE token = ANY($1)`,
            [invalid],
          );
          this.logger.debug(`Removed ${invalid.length} invalid FCM token(s)`);
        }
      } catch (e) {
        this.logger.error('FCM multicast error', e);
      }
    }
  }

  private _chunk<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size)
      chunks.push(arr.slice(i, i + size));
    return chunks;
  }
}
