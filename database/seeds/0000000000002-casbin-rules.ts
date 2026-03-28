import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reglas Casbin consolidadas — estado final después de todos los seeds anteriores.
 *
 * v0 = rol | v1 = ruta | v2 = método(s) | v3 = allow | v4 = backend | frontend
 *
 * Roles: superadmin | admin | rider | client | shop_staff
 */
export class CasbinRules0000000000002 implements MigrationInterface {
  name = 'CasbinRules0000000000002';

  private async insert(
    qr: QueryRunner,
    rules: Array<[string, string, string, string]>,
  ): Promise<void> {
    for (const [v0, v1, v2, v4] of rules) {
      await qr.query(
        `INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4)
         VALUES ('p', $1, $2, $3, 'allow', $4)
         ON CONFLICT DO NOTHING`,
        [v0, v1, v2, v4],
      );
    }
  }

  public async up(qr: QueryRunner): Promise<void> {
    const SA = 'superadmin';
    const AD = 'admin';
    const RI = 'rider';
    const CL = 'client';
    const SS = 'shop_staff';
    const BE = 'backend';
    const FE = 'frontend';

    await this.insert(qr, [
      // ── AUTH ──────────────────────────────────────────────────────────────
      [SA, '/api/auth/me',               'GET', BE],
      [AD, '/api/auth/me',               'GET', BE],
      [RI, '/api/auth/me',               'GET', BE],
      [CL, '/api/auth/me',               'GET', BE],
      [SA, '/api/auth/frontend-access',  'GET', BE],
      [AD, '/api/auth/frontend-access',  'GET', BE],
      [RI, '/api/auth/frontend-access',  'GET', BE],
      [CL, '/api/auth/frontend-access',  'GET', BE],

      // ── ORDERS ────────────────────────────────────────────────────────────
      [SA, '/api/orders/admin/all',          'GET', BE],
      [AD, '/api/orders/admin/all',          'GET', BE],
      [SA, '/api/orders/admin/stats',        'GET', BE],
      [SA, '/api/orders/:id/status',         'PUT', BE],
      [SA, '/api/orders/shop/mine',          'GET', BE],
      [AD, '/api/orders/shop/mine',          'GET', BE],
      [SA, '/api/orders/:id/preparing',      'PUT', BE],
      [AD, '/api/orders/:id/preparing',      'PUT', BE],
      [SA, '/api/orders/:id/ready',          'PUT', BE],
      [AD, '/api/orders/:id/ready',          'PUT', BE],
      [SA, '/api/orders/:id/deliver',        'PUT', BE],
      [AD, '/api/orders/:id/deliver',        'PUT', BE],
      [SA, '/api/orders/:id/on-the-way',     'PUT', BE],
      [RI, '/api/orders/:id/on-the-way',     'PUT', BE],
      [SA, '/api/orders/:id/done',           'PUT', BE],
      [RI, '/api/orders/:id/done',           'PUT', BE],
      [RI, '/api/orders/:id/rider-cancel',   'POST', BE],

      // ── ORDERS / SHOP LOCAL ───────────────────────────────────────────────
      [SA, '/api/orders/shop/local/areas',                  'GET',  BE],
      [SA, '/api/orders/shop/local/areas',                  'POST', BE],
      [SA, '/api/orders/shop/local/cash',                   'POST', BE],
      [AD, '/api/orders/shop/local/cash',                   'POST', BE],
      [SA, '/api/orders/shop/local/area-kind-options',      'GET',  BE],
      [AD, '/api/orders/shop/local/area-kind-options',      'GET',  BE],
      [SS, '/api/orders/shop/local/area-kind-options',      'GET',  BE],
      [SA, '/api/orders/shop/:shopId/local/areas',          'GET',  BE],
      [SA, '/api/orders/shop/:shopId/local/areas',          'POST', BE],
      [AD, '/api/orders/shop/:shopId/local/areas',          'GET',  BE],
      [AD, '/api/orders/shop/:shopId/local/areas',          'POST', BE],

      // ── SHOPS ─────────────────────────────────────────────────────────────
      [SA, '/api/shops',                          'POST',          BE],
      [SA, '/api/shops/mine',                     'GET',           BE],
      [AD, '/api/shops/mine',                     'GET',           BE],
      [SA, '/api/shops/:id',                      'PATCH',         BE],
      [AD, '/api/shops/:id',                      'PATCH',         BE],
      [SA, '/api/shops/:id/menu/categories',      'POST',          BE],
      [AD, '/api/shops/:id/menu/categories',      'POST',          BE],
      [SA, '/api/shops/:id/menu',                 'POST',          BE],
      [AD, '/api/shops/:id/menu',                 'POST',          BE],
      [SA, '/api/shops/:id/menu/:itemId',         'PATCH',         BE],
      [AD, '/api/shops/:id/menu/:itemId',         'PATCH',         BE],
      [SA, '/api/shops/:id/staff',                'GET|POST',      BE],
      [AD, '/api/shops/:id/staff',                'GET|POST',      BE],
      [SA, '/api/shops/:id/staff/:staffId',       'PATCH|DELETE',  BE],
      [AD, '/api/shops/:id/staff/:staffId',       'PATCH|DELETE',  BE],
      [SA, '/api/shops/:id/schedule',             'GET|PUT',       BE],
      [AD, '/api/shops/:id/schedule',             'GET|PUT',       BE],
      [SA, '/api/shops/:id/schedule/:day',        'PATCH',         BE],
      [AD, '/api/shops/:id/schedule/:day',        'PATCH',         BE],
      [SA, '/api/shops/:id/upload-qr',            'POST',          BE],
      [AD, '/api/shops/:id/upload-qr',            'POST',          BE],
      [SA, '/api/shops/:id/upload-menu-image',    'POST',          BE],
      [AD, '/api/shops/:id/upload-menu-image',    'POST',          BE],

      // ── RIDER ─────────────────────────────────────────────────────────────
      [SA, '/api/rider/list',                       'GET',  BE],
      [SA, '/api/rider/location/config',             'GET',  BE],
      [AD, '/api/rider/location/config',             'GET',  BE],
      [RI, '/api/rider/location/config',             'GET',  BE],
      [RI, '/api/rider/location/batch',              'POST', BE],
      [SA, '/api/rider/:id/location-history/dates',  'GET',  BE],
      [SA, '/api/rider/:id/location-history',        'GET',  BE],
      [SA, '/api/rider/:id/deliveries',              'GET',  BE],
      [SA, '/api/rider/groups/available',            'GET',  BE],
      [RI, '/api/rider/groups/available',            'GET',  BE],
      [SA, '/api/rider/groups/my-active',            'GET',  BE],
      [RI, '/api/rider/groups/my-active',            'GET',  BE],
      [SA, '/api/rider/groups/:id/accept',           'POST', BE],
      [RI, '/api/rider/groups/:id/accept',           'POST', BE],
      [RI, '/api/rider/orders/:orderId/delivered',   'PUT',  BE],
      [SA, '/api/rider/:id/credits',                 'GET',  BE],
      [SA, '/api/rider/:id/credits',                 'PATCH',BE],
      [RI, '/api/rider/credits/me',                  'GET',  BE],
      [RI, '/api/rider/available',                   'PATCH',BE],
      [RI, '/api/rider/stats/today',                 'GET',  BE],

      // ── CONFIG ────────────────────────────────────────────────────────────
      [SA, '/api/config/:key',        'PUT',  BE],
      [SA, '/api/config/:key',        'GET',  BE],
      [RI, '/api/config/:key',        'GET',  BE],
      [SA, '/api/config/upload-image','POST', BE],

      // ── USERS ─────────────────────────────────────────────────────────────
      [SA, '/api/users',                       'GET',                    BE],
      [AD, '/api/users',                       'GET',                    BE],
      [SA, '/api/users',                       'POST',                   BE],
      [SA, '/api/users/admins',                'GET',                    BE],
      [SA, '/api/users/:id/roles',             'GET|POST|PATCH|DELETE|PUT', BE],
      [SA, '/api/users/:id/rider-info',        'PATCH',                  BE],
      [SA, '/api/users/:id/admin-info',        'PATCH',                  BE],
      [SA, '/api/users/:id/upload-rider-image','POST',                   BE],
      [SA, '/api/users/:id/profile',           'PATCH',                  BE],
      [CL, '/api/users/profile',               'PATCH',                  BE],
      [RI, '/api/users/profile',               'PATCH',                  BE],
      [AD, '/api/users/profile',               'PATCH',                  BE],
      [SA, '/api/users/profile',               'PATCH',                  BE],
      [SS, '/api/users/profile',               'PATCH',                  BE],

      // ── ROLES ─────────────────────────────────────────────────────────────
      [SA, '/api/roles/permissions',       'GET', BE],
      [SA, '/api/roles/:role/permissions', 'PUT', BE],

      // ── ZONES ─────────────────────────────────────────────────────────────
      [SA, '/api/zones',          'GET|POST',         BE],
      [SA, '/api/zones/:id',      'GET|PATCH|DELETE', BE],
      [SA, '/api/zones/detect',   'GET',              BE],
      [AD, '/api/zones',          'GET',              BE],
      [AD, '/api/zones/detect',   'GET',              BE],
      [CL, '/api/zones/detect',   'GET',              BE],

      // ── PAYMENTS / FINANZAS ───────────────────────────────────────────────
      [SA, '/api/payments/admin/summary',                'GET', BE],
      [SA, '/api/payments/admin/list',                   'GET', BE],
      [SA, '/api/payments/admin/bank-accounts',          'GET', BE],
      [SA, '/api/payments/admin/withdrawals',            'GET', BE],
      [SA, '/api/payments/admin/withdrawals/:id/process','PUT', BE],
      [SA, '/api/payments/admin/shop/:id/income',        'GET', BE],
      [SA, '/api/payments/admin/shop/:id/bank-accounts', 'GET', BE],
      [SA, '/api/payments/admin/shop/:id/withdrawals',   'GET', BE],
      [AD, '/api/payments/my/income',                    'GET', BE],
      [AD, '/api/payments/my/bank-accounts',             'GET', BE],
      [AD, '/api/payments/my/withdrawals',               'GET', BE],
      [AD, '/api/payments/my/withdrawal',                'POST',BE],
      [RI, '/api/payments/rider/bank-accounts',          'GET', BE],
      [RI, '/api/payments/rider/bank-accounts',          'POST',BE],
      [RI, '/api/payments/rider/bank-accounts/:id',      'DELETE',BE],
      [RI, '/api/payments/rider/income',                 'GET', BE],
      [RI, '/api/payments/rider/withdrawals',            'GET', BE],
      [RI, '/api/payments/rider/withdrawal',             'POST',BE],

      // ── SUPPORT ───────────────────────────────────────────────────────────
      [CL, '/api/support/tickets',          'POST', BE],
      [CL, '/api/support/tickets',          'GET',  BE],
      [RI, '/api/support/tickets',          'POST', BE],
      [RI, '/api/support/tickets',          'GET',  BE],
      [AD, '/api/support/tickets',          'POST', BE],
      [AD, '/api/support/tickets',          'GET',  BE],
      [SA, '/api/support/admin/tickets',    'GET',  BE],
      [SA, '/api/support/admin/tickets/:id','PATCH',BE],

      // ── COUPONS ───────────────────────────────────────────────────────────
      [CL, '/api/coupons/validate',              'POST', BE],
      [RI, '/api/coupons/validate',              'POST', BE],
      [AD, '/api/coupons/validate',              'POST', BE],
      [SA, '/api/coupons/validate',              'POST', BE],
      [SA, '/api/coupons',                       'POST', BE],
      [SA, '/api/coupons',                       'GET',  BE],
      [SA, '/api/coupons/:id/deactivate',        'PATCH',BE],
      [SA, '/api/coupons/:id/activate',          'PATCH',BE],
      [AD, '/api/coupons/shop',                  'POST', BE],
      [AD, '/api/coupons/shop',                  'GET',  BE],
      [AD, '/api/coupons/shop/:id/deactivate',   'PATCH',BE],
      [AD, '/api/coupons/shop/:id/activate',     'PATCH',BE],

      // ── CREDITS ───────────────────────────────────────────────────────────
      [SA, '/api/credits/packages',                  'GET',  BE],
      [RI, '/api/credits/packages',                  'GET',  BE],
      [SA, '/api/credits/packages',                  'POST', BE],
      [SA, '/api/credits/packages/:id',              'PATCH',BE],
      [RI, '/api/credits/packages/:id/claim',        'POST', BE],
      [RI, '/api/credits/purchases/:id',             'DELETE',BE],
      [RI, '/api/credits/purchases/:id/proof',       'POST', BE],
      [RI, '/api/credits/my-balance',                'GET',  BE],
      [RI, '/api/credits/my-history',                'GET',  BE],
      [SA, '/api/credits/admin/purchases',           'GET',  BE],
      [SA, '/api/credits/admin/rider-balances',      'GET',  BE],
      [SA, '/api/credits/admin/confirm/:reference',  'POST', BE],
      [SA, '/api/credits/admin/refresh-qr',          'POST', BE],
      [SA, '/api/credits/admin/reject/:reference',   'POST', BE],
      [SA, '/api/credits/packages/:id/qr-image',     'POST', BE],
      [SA, '/api/credits/packages/:id/qr-image',     'DELETE', BE],

      // ── RATINGS ───────────────────────────────────────────────────────────
      [CL, '/api/ratings',             'POST', BE],
      [CL, '/api/ratings/pending/:id', 'GET',  BE],
      [CL, '/api/ratings/my-pending',  'GET',  BE],
      [RI, '/api/ratings',             'POST', BE],
      [RI, '/api/ratings/pending/:id', 'GET',  BE],
      [RI, '/api/ratings/my-pending',  'GET',  BE],
      [AD, '/api/ratings',             'POST', BE],
      [AD, '/api/ratings/pending/:id', 'GET',  BE],
      [AD, '/api/ratings/my-pending',  'GET',  BE],

      // ── FRONTEND — DASHBOARD ──────────────────────────────────────────────
      [SA, '/dashboard',                    'VIEW', FE],
      [AD, '/dashboard',                    'VIEW', FE],
      [RI, '/dashboard',                    'VIEW', FE],
      [CL, '/dashboard/profile',            'VIEW', FE],
      [RI, '/dashboard/profile',            'VIEW', FE],
      [AD, '/dashboard/profile',            'VIEW', FE],
      [SA, '/dashboard/profile',            'VIEW', FE],
      [SS, '/dashboard/profile',            'VIEW', FE],

      // Orders
      [SA, '/dashboard/orders',             'VIEW', FE],
      [AD, '/dashboard/orders',             'VIEW', FE],
      [RI, '/dashboard/orders',             'VIEW', FE],

      // My shop (admin) / Shops (superadmin)
      [AD, '/dashboard/my-shop',            'VIEW', FE],
      [AD, '/dashboard/staff',              'VIEW', FE],
      [AD, '/dashboard/my-shop/services',   'VIEW', FE],
      [SA, '/dashboard/my-shop/services',   'VIEW', FE],

      // My market
      [AD, '/dashboard/my-market',          'VIEW', FE],
      [SA, '/dashboard/my-market',          'VIEW', FE],
      [AD, '/dashboard/my-market/services', 'VIEW', FE],
      [SA, '/dashboard/my-market/services', 'VIEW', FE],

      // Superadmin only
      [SA, '/dashboard/shops',              'VIEW', FE],
      [SA, '/dashboard/users',              'VIEW', FE],
      [SA, '/dashboard/config',             'VIEW', FE],
      [SA, '/dashboard/roles',              'VIEW', FE],
      [SA, '/dashboard/riders',             'VIEW', FE],
      [SA, '/dashboard/zones',              'VIEW', FE],
      [SA, '/dashboard/credits',            'VIEW', FE],

      // Finance — superadmin global
      [SA, '/dashboard/payments',           'VIEW', FE],
      [SA, '/dashboard/income',             'VIEW', FE],
      [SA, '/dashboard/bank-accounts',      'VIEW', FE],
      [SA, '/dashboard/withdrawals',        'VIEW', FE],

      // Finance — admin per-shop
      [AD, '/dashboard/income',             'VIEW', FE],
      [AD, '/dashboard/bank-accounts',      'VIEW', FE],
      [AD, '/dashboard/withdrawals',        'VIEW', FE],

      // Coupons
      [SA, '/dashboard/coupons',            'VIEW', FE],
      [AD, '/dashboard/coupons',            'VIEW', FE],

      // Support
      [CL, '/dashboard/support',            'VIEW', FE],
      [RI, '/dashboard/support',            'VIEW', FE],
      [AD, '/dashboard/support',            'VIEW', FE],
      [SA, '/dashboard/support',            'VIEW', FE],
    ]);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DELETE FROM casbin_rule`);
  }
}
