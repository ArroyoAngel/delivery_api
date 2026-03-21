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
      [SA, '/api/orders/shop/mine', 'GET'],
      [AD, '/api/orders/shop/mine', 'GET'],

      // Shops — endpoints con CasbinGuard
      [SA, '/api/shops/mine',                     'GET'],
      [AD, '/api/shops/mine',                     'GET'],
      [SA, '/api/shops/:id',                      'PATCH'],
      [AD, '/api/shops/:id',                      'PATCH'],
      [SA, '/api/shops/:id/menu/categories',      'POST'],
      [AD, '/api/shops/:id/menu/categories',      'POST'],
      [SA, '/api/shops/:id/menu',                 'POST'],
      [AD, '/api/shops/:id/menu',                 'POST'],
      [SA, '/api/shops/:id/menu/:itemId',         'PATCH'],
      [AD, '/api/shops/:id/menu/:itemId',         'PATCH'],
      [SA, '/api/shops/:id/staff',                'GET|POST'],
      [AD, '/api/shops/:id/staff',                'GET|POST'],
      [SA, '/api/shops/:id/staff/:staffId',       'PATCH|DELETE'],
      [AD, '/api/shops/:id/staff/:staffId',       'PATCH|DELETE'],
      [SA, '/api/shops/:id/schedule',             'GET|PUT'],
      [AD, '/api/shops/:id/schedule',             'GET|PUT'],
      [SA, '/api/shops/:id/schedule/:day',        'PATCH'],
      [AD, '/api/shops/:id/schedule/:day',        'PATCH'],

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

      // System Config
      [SA, '/api/config/:key', 'PUT'],

      // Users
      [SA, '/api/users',          'GET'],
      [AD, '/api/users',          'GET'],
      [SA, '/api/users/:id/roles', 'GET|POST|PATCH|DELETE|PUT'],

      // Roles
      [SA, '/api/roles/permissions',        'GET'],
      [SA, '/api/roles/:role/permissions',  'PUT'],

      // Finanzas admin
      [SA, '/api/payments/admin/summary',      'GET'],
      [SA, '/api/payments/admin/list',         'GET'],
      [SA, '/api/payments/admin/bank-accounts','GET'],
      [SA, '/api/payments/admin/withdrawals',  'GET'],
      [AD, '/api/payments/my/income',          'GET'],
      [AD, '/api/payments/my/bank-accounts',   'GET'],
      [AD, '/api/payments/my/withdrawals',     'GET'],
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

      // Mi negocio — solo admin (superadmin usa /dashboard/shops)
      [AD, '/dashboard/my-shop'],

      // Personal del negocio — solo admin (superadmin no necesita Mi Personal)
      [AD, '/dashboard/staff'],

      // Solo superadmin
      [SA, '/dashboard/shops'],
      [SA, '/dashboard/users'],
      [SA, '/dashboard/config'],
      [SA, '/dashboard/roles'],

      // Finanzas admin
      [SA, '/dashboard/payments'],
      [SA, '/dashboard/bank-accounts'],
      [SA, '/dashboard/withdrawals'],
      [AD, '/dashboard/my-shop/income'],
      [AD, '/dashboard/my-shop/bank-accounts'],
      [AD, '/dashboard/my-shop/withdrawals'],

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
