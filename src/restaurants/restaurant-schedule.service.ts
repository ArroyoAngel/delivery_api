import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RestaurantStaffPermission } from './restaurant-staff-permission.enum';

interface DayScheduleDto {
  dayOfWeek: number;
  openTime?: string | null;
  closeTime?: string | null;
  isClosed?: boolean;
}

@Injectable()
export class RestaurantScheduleService {
  constructor(private readonly dataSource: DataSource) {}

  // ── helpers ───────────────────────────────────────────────────────────────

  /**
   * Verifica que el requester tenga acceso al restaurante.
   * Si se pasa `permission`, además verifica que el staff lo tenga en granted_permissions.
   * El dueño (owner_account_id) siempre pasa.
   */
  private async verifyAccess(
    restaurantId: string,
    accountId: string,
    permission?: RestaurantStaffPermission,
  ) {
    const [isOwner] = await this.dataSource.query(
      'SELECT 1 FROM restaurants WHERE id = $1 AND owner_account_id = $2',
      [restaurantId, accountId],
    );
    if (isOwner) return;

    const permCheck = permission
      ? `AND $3 = ANY(a.granted_permissions)`
      : '';
    const params: any[] = [restaurantId, accountId];
    if (permission) params.push(permission);

    const [isStaff] = await this.dataSource.query(
      `SELECT 1
       FROM admins a
       JOIN profiles p ON p.id = a.profile_id
       WHERE a.restaurant_id = $1
         AND p.account_id   = $2
         ${permCheck}`,
      params,
    );

    if (!isStaff) {
      throw new ForbiddenException(
        permission
          ? `No tenés el permiso "${permission}" en este restaurante`
          : 'No tenés acceso a este restaurante',
      );
    }
  }

  // ── endpoints ─────────────────────────────────────────────────────────────

  async getSchedule(restaurantId: string) {
    const [restaurant] = await this.dataSource.query(
      'SELECT id FROM restaurants WHERE id = $1',
      [restaurantId],
    );
    if (!restaurant) throw new NotFoundException('Restaurante no encontrado');

    return this.dataSource.query(
      `SELECT id,
              day_of_week AS "dayOfWeek",
              open_time   AS "openTime",
              close_time  AS "closeTime",
              is_closed   AS "isClosed"
       FROM restaurant_schedules
       WHERE restaurant_id = $1
       ORDER BY day_of_week`,
      [restaurantId],
    );
  }

  /**
   * Reemplaza el horario completo del restaurante (upsert por día).
   * Para marcar un día como cerrado: { dayOfWeek: N, isClosed: true }
   */
  async setSchedule(
    restaurantId: string,
    requesterAccountId: string,
    days: DayScheduleDto[],
  ) {
    await this.verifyAccess(
      restaurantId,
      requesterAccountId,
      RestaurantStaffPermission.MANAGE_SCHEDULE,
    );

    const [restaurant] = await this.dataSource.query(
      'SELECT id FROM restaurants WHERE id = $1',
      [restaurantId],
    );
    if (!restaurant) throw new NotFoundException('Restaurante no encontrado');

    for (const day of days) {
      await this.dataSource.query(
        `INSERT INTO restaurant_schedules
           (restaurant_id, day_of_week, open_time, close_time, is_closed)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (restaurant_id, day_of_week)
         DO UPDATE SET
           open_time  = EXCLUDED.open_time,
           close_time = EXCLUDED.close_time,
           is_closed  = EXCLUDED.is_closed`,
        [
          restaurantId,
          day.dayOfWeek,
          day.openTime ?? null,
          day.closeTime ?? null,
          day.isClosed ?? false,
        ],
      );
    }

    return this.getSchedule(restaurantId);
  }

  /** Actualiza un único día de la semana. */
  async updateDay(
    restaurantId: string,
    dayOfWeek: number,
    requesterAccountId: string,
    dto: Omit<DayScheduleDto, 'dayOfWeek'>,
  ) {
    await this.verifyAccess(
      restaurantId,
      requesterAccountId,
      RestaurantStaffPermission.MANAGE_SCHEDULE,
    );

    await this.dataSource.query(
      `INSERT INTO restaurant_schedules
         (restaurant_id, day_of_week, open_time, close_time, is_closed)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (restaurant_id, day_of_week)
       DO UPDATE SET
         open_time  = CASE WHEN $3::time IS NOT NULL THEN $3 ELSE restaurant_schedules.open_time  END,
         close_time = CASE WHEN $4::time IS NOT NULL THEN $4 ELSE restaurant_schedules.close_time END,
         is_closed  = COALESCE($5, restaurant_schedules.is_closed)`,
      [
        restaurantId,
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
       FROM restaurant_schedules
       WHERE restaurant_id = $1 AND day_of_week = $2`,
      [restaurantId, dayOfWeek],
    );
    return row;
  }
}
