import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ShopStaffPermission } from './shop-staff-permission.enum';

interface DayScheduleDto {
  dayOfWeek: number;
  openTime?: string | null;
  closeTime?: string | null;
  isClosed?: boolean;
}

@Injectable()
export class ShopScheduleService {
  constructor(private readonly dataSource: DataSource) {}

  // ── helpers ───────────────────────────────────────────────────────────────

  /**
   * Verifica que el requester tenga acceso al negocio.
   * Si se pasa `permission`, además verifica que el staff lo tenga en granted_permissions.
   * El dueño (owner_account_id) siempre pasa.
   */
  private async verifyAccess(
    shopId: string,
    accountId: string,
    permission?: ShopStaffPermission,
  ) {
    const [isOwner] = await this.dataSource.query(
      'SELECT 1 FROM shops WHERE id = $1 AND owner_account_id = $2',
      [shopId, accountId],
    );
    if (isOwner) return;

    const permCheck = permission ? `AND $3 = ANY(a.granted_permissions)` : '';
    const params: any[] = [shopId, accountId];
    if (permission) params.push(permission);

    const [isStaff] = await this.dataSource.query(
      `SELECT 1
       FROM admins a
       JOIN profiles p ON p.id = a.profile_id
       WHERE a.shop_id = $1
         AND p.account_id   = $2
         ${permCheck}`,
      params,
    );

    if (!isStaff) {
      throw new ForbiddenException(
        permission
          ? `No tenés el permiso "${permission}" en este negocio`
          : 'No tenés acceso a este negocio',
      );
    }
  }

  // ── endpoints ─────────────────────────────────────────────────────────────

  async getSchedule(shopId: string) {
    const [shop] = await this.dataSource.query(
      'SELECT id FROM shops WHERE id = $1',
      [shopId],
    );
    if (!shop) throw new NotFoundException('Negocio no encontrado');

    return this.dataSource.query(
      `SELECT id,
              day_of_week AS "dayOfWeek",
              open_time   AS "openTime",
              close_time  AS "closeTime",
              is_closed   AS "isClosed"
       FROM shop_schedules
       WHERE shop_id = $1
       ORDER BY day_of_week`,
      [shopId],
    );
  }

  /**
   * Reemplaza el horario completo del negocio (upsert por día).
   * Para marcar un día como cerrado: { dayOfWeek: N, isClosed: true }
   */
  async setSchedule(
    shopId: string,
    requesterAccountId: string,
    days: DayScheduleDto[],
  ) {
    await this.verifyAccess(
      shopId,
      requesterAccountId,
      ShopStaffPermission.MANAGE_SCHEDULE,
    );

    const [shop] = await this.dataSource.query(
      'SELECT id FROM shops WHERE id = $1',
      [shopId],
    );
    if (!shop) throw new NotFoundException('Negocio no encontrado');

    for (const day of days) {
      await this.dataSource.query(
        `INSERT INTO shop_schedules
           (shop_id, day_of_week, open_time, close_time, is_closed)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (shop_id, day_of_week)
         DO UPDATE SET
           open_time  = EXCLUDED.open_time,
           close_time = EXCLUDED.close_time,
           is_closed  = EXCLUDED.is_closed`,
        [
          shopId,
          day.dayOfWeek,
          day.openTime ?? null,
          day.closeTime ?? null,
          day.isClosed ?? false,
        ],
      );
    }

    return this.getSchedule(shopId);
  }

  /** Actualiza un único día de la semana. */
  async updateDay(
    shopId: string,
    dayOfWeek: number,
    requesterAccountId: string,
    dto: Omit<DayScheduleDto, 'dayOfWeek'>,
  ) {
    await this.verifyAccess(
      shopId,
      requesterAccountId,
      ShopStaffPermission.MANAGE_SCHEDULE,
    );

    await this.dataSource.query(
      `INSERT INTO shop_schedules
         (shop_id, day_of_week, open_time, close_time, is_closed)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (shop_id, day_of_week)
       DO UPDATE SET
         open_time  = CASE WHEN $3::time IS NOT NULL THEN $3 ELSE shop_schedules.open_time  END,
         close_time = CASE WHEN $4::time IS NOT NULL THEN $4 ELSE shop_schedules.close_time END,
         is_closed  = COALESCE($5, shop_schedules.is_closed)`,
      [
        shopId,
        dayOfWeek,
        dto.openTime ?? null,
        dto.closeTime ?? null,
        dto.isClosed ?? null,
      ],
    );

    const [row] = await this.dataSource.query(
      `SELECT id,
              day_of_week AS "dayOfWeek",
              open_time   AS "openTime",
              close_time  AS "closeTime",
              is_closed   AS "isClosed"
       FROM shop_schedules
       WHERE shop_id = $1 AND day_of_week = $2`,
      [shopId, dayOfWeek],
    );
    return row;
  }
}
