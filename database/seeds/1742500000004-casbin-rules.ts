import { MigrationInterface, QueryRunner } from 'typeorm';
import { RolEnum } from '../../src/authorization/rol.enum';

const { SUPERADMIN: SA, ADMIN: AD, RIDER: RI, CLIENT: CL } = RolEnum;

/**
 * Políticas CASBIN consolidadas para YaYa Eats.
 *
 * v0 = rol | v1 = ruta | v2 = métodos (regexMatch) | v3 = allow | v4 = backend|frontend
 *
 * Roles activos: superadmin | admin | rider | client
 * Prefijo global API: /api  (definido en main.ts con app.setGlobalPrefix('api'))
 *
 * Solo se incluyen endpoints protegidos con CasbinGuard.
 * Los endpoints con JwtAuthGuard solamente no necesitan reglas aquí.
 */
export class CasbinRules1742500000004 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {

    // ── BACKEND ───────────────────────────────────────────────────────────
    const backend: Array<[string, string, string]> = [

      // Auth
      [SA, '/api/auth/me',              'GET'],
      [AD, '/api/auth/me',              'GET'],
      [RI, '/api/auth/me',              'GET'],
      [CL, '/api/auth/me',              'GET'],
      [SA, '/api/auth/frontend-access', 'GET'],
      [AD, '/api/auth/frontend-access', 'GET'],
      [RI, '/api/auth/frontend-access', 'GET'],
      [CL, '/api/auth/frontend-access', 'GET'],

      // Orders — solo endpoints con CasbinGuard
      [SA, '/api/orders/admin/all',       'GET'],
      [AD, '/api/orders/admin/all',       'GET'],
      [SA, '/api/orders/admin/stats',     'GET'],
      [SA, '/api/orders/:id/status',      'PUT'],
      [AD, '/api/orders/:id/status',      'PUT'],
      [SA, '/api/orders/restaurant/mine', 'GET'],
      [AD, '/api/orders/restaurant/mine', 'GET'],

      // Restaurants — endpoints con CasbinGuard
      [SA, '/api/restaurants/mine',                     'GET'],
      [AD, '/api/restaurants/mine',                     'GET'],
      [SA, '/api/restaurants/:id',                      'PATCH'],
      [AD, '/api/restaurants/:id',                      'PATCH'],
      [SA, '/api/restaurants/:id/menu/categories',      'POST'],
      [AD, '/api/restaurants/:id/menu/categories',      'POST'],
      [SA, '/api/restaurants/:id/menu',                 'POST'],
      [AD, '/api/restaurants/:id/menu',                 'POST'],
      [SA, '/api/restaurants/:id/menu/:itemId',         'PATCH'],
      [AD, '/api/restaurants/:id/menu/:itemId',         'PATCH'],
      [SA, '/api/restaurants/:id/staff',                'GET|POST'],
      [AD, '/api/restaurants/:id/staff',                'GET|POST'],
      [SA, '/api/restaurants/:id/staff/:staffId',       'PATCH|DELETE'],
      [AD, '/api/restaurants/:id/staff/:staffId',       'PATCH|DELETE'],
      [SA, '/api/restaurants/:id/schedule',             'GET|PUT'],
      [AD, '/api/restaurants/:id/schedule',             'GET|PUT'],
      [SA, '/api/restaurants/:id/schedule/:day',        'PATCH'],
      [AD, '/api/restaurants/:id/schedule/:day',        'PATCH'],

      // Rider — todos los endpoints tienen CasbinGuard a nivel de clase
      [SA, '/api/rider/list',                      'GET'],
      [AD, '/api/rider/list',                      'GET'],
      [SA, '/api/rider/location/config',           'GET'],
      [AD, '/api/rider/location/config',           'GET'],
      [RI, '/api/rider/location/config',           'GET'],
      [RI, '/api/rider/location/batch',            'POST'],
      [SA, '/api/rider/:id/location-history/dates', 'GET'],
      [SA, '/api/rider/:id/location-history',      'GET'],
      [SA, '/api/rider/:id/deliveries',            'GET'],
      [AD, '/api/rider/:id/deliveries',            'GET'],
      [SA, '/api/rider/groups/available',          'GET'],
      [RI, '/api/rider/groups/available',          'GET'],
      [SA, '/api/rider/groups/my-active',          'GET'],
      [RI, '/api/rider/groups/my-active',          'GET'],
      [SA, '/api/rider/groups/:id/accept',         'POST'],
      [RI, '/api/rider/groups/:id/accept',         'POST'],
      [RI, '/api/rider/orders/:orderId/delivered', 'PUT'],
      [SA, '/api/rider/orders/:orderId/ready',     'PUT'],
      [AD, '/api/rider/orders/:orderId/ready',     'PUT'],

      // System Config
      [SA, '/api/config/:key', 'PUT'],

      // Users
      [SA, '/api/users',          'GET'],
      [AD, '/api/users',          'GET'],
      [SA, '/api/users/:id/roles', 'GET|POST|PATCH|DELETE|PUT'],

      // Roles
      [SA, '/api/roles/permissions',        'GET'],
      [SA, '/api/roles/:role/permissions',  'PUT'],
    ];

    for (const [role, route, actions] of backend) {
      await queryRunner.query(
        `INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4)
         VALUES ('p', $1, $2, $3, 'allow', 'backend')`,
        [role, route, actions],
      );
    }

    // ── FRONTEND (sidebar del dashboard) ──────────────────────────────────
    const frontend: Array<[string, string]> = [
      // Dashboard principal
      [SA, '/dashboard'],
      [AD, '/dashboard'],
      [RI, '/dashboard'],

      // Pedidos
      [SA, '/dashboard/orders'],
      [AD, '/dashboard/orders'],
      [RI, '/dashboard/orders'],

      // Mi restaurante — solo admin (superadmin usa /dashboard/restaurants)
      [AD, '/dashboard/my-restaurant'],

      // Personal del restaurante — solo admin (superadmin no necesita Mi Personal)
      [AD, '/dashboard/staff'],

      // Solo superadmin
      [SA, '/dashboard/restaurants'],
      [SA, '/dashboard/users'],
      [SA, '/dashboard/config'],
      [SA, '/dashboard/roles'],

      // Repartidores: superadmin y admin
      [SA, '/dashboard/riders'],
      [AD, '/dashboard/riders'],
    ];

    for (const [role, route] of frontend) {
      await queryRunner.query(
        `INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4)
         VALUES ('p', $1, $2, 'VIEW', 'allow', 'frontend')`,
        [role, route],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM casbin_rule`);
  }
}
