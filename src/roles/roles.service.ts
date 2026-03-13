import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export const SYSTEM_ROLES = ['superadmin', 'admin', 'rider', 'client'] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];

export const ALL_FRONTEND_ROUTES = [
  '/dashboard',
  '/dashboard/orders',
  '/dashboard/my-restaurant',
  '/dashboard/staff',
  '/dashboard/restaurants',
  '/dashboard/users',
  '/dashboard/riders',
  '/dashboard/config',
  '/dashboard/roles',
] as const;

@Injectable()
export class RolesService {
  constructor(private dataSource: DataSource) {}

  async getPermissions() {
    const rows = await this.dataSource.query(
      `SELECT v0 AS role, v1 AS route
       FROM casbin_rule
       WHERE ptype = 'p'
         AND v4    = 'frontend'
         AND v3    = 'allow'
         AND v0    = ANY($1::text[])
       ORDER BY v0, v1`,
      [SYSTEM_ROLES],
    );

    return SYSTEM_ROLES.map((role) => ({
      role,
      routes: rows
        .filter((r: { role: string }) => r.role === role)
        .map((r: { route: string }) => r.route),
    }));
  }

  async updatePermissions(role: string, routes: string[]) {
    if (!(SYSTEM_ROLES as readonly string[]).includes(role)) {
      throw new BadRequestException(`Rol inválido: ${role}`);
    }

    const validRoutes = routes.filter((r) =>
      (ALL_FRONTEND_ROUTES as readonly string[]).includes(r),
    );

    await this.dataSource.transaction(async (em) => {
      await em.query(
        `DELETE FROM casbin_rule WHERE ptype='p' AND v0=$1 AND v4='frontend'`,
        [role],
      );
      for (const route of validRoutes) {
        await em.query(
          `INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4)
           VALUES ('p', $1, $2, 'VIEW', 'allow', 'frontend')`,
          [role, route],
        );
      }
    });

    return { role, routes: validRoutes };
  }
}
