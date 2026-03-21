import { MigrationInterface, QueryRunner } from 'typeorm';

export class CasbinShopServices1742500000018 implements MigrationInterface {
  name = 'CasbinShopServices1742500000018';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const backendRules: Array<[string, string, string]> = [
      ['admin', '/api/orders/shop/local/areas', 'GET'],
      ['admin', '/api/orders/shop/local/areas', 'POST'],
      ['admin', '/api/orders/shop/local/cash', 'POST'],
      ['superadmin', '/api/orders/shop/local/areas', 'GET'],
      ['superadmin', '/api/orders/shop/local/areas', 'POST'],
      ['superadmin', '/api/orders/shop/local/cash', 'POST'],
    ];

    for (const [role, route, method] of backendRules) {
      await queryRunner.query(
        `INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4)
         VALUES ('p', $1, $2, $3, 'allow', 'backend')
         ON CONFLICT DO NOTHING`,
        [role, route, method],
      );
    }

    const frontendRoutes: Array<[string, string]> = [
      ['admin', '/dashboard/my-shop/services'],
      ['superadmin', '/dashboard/my-shop/services'],
    ];

    for (const [role, route] of frontendRoutes) {
      await queryRunner.query(
        `INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4)
         VALUES ('p', $1, $2, 'VIEW', 'allow', 'frontend')
         ON CONFLICT DO NOTHING`,
        [role, route],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM casbin_rule
       WHERE ptype = 'p'
         AND v4 = 'backend'
         AND v1 IN (
           '/api/orders/shop/local/areas',
           '/api/orders/shop/local/cash'
         )`,
    );

    await queryRunner.query(
      `DELETE FROM casbin_rule
       WHERE ptype = 'p'
         AND v4 = 'frontend'
         AND v1 = '/dashboard/my-shop/services'`,
    );
  }
}
