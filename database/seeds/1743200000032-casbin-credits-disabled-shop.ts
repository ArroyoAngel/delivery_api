import { MigrationInterface, QueryRunner } from 'typeorm';
import { RolEnum } from '../../src/authorization/rol.enum';

const { SUPERADMIN: SA, RIDER: RI } = RolEnum;

export class CasbinCreditsDisabledShop1743200000032 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const backend: Array<[string, string, string]> = [
      // Rider credits (delivery-groups module)
      [SA, '/api/rider/:id/credits', 'GET'],
      [SA, '/api/rider/:id/credits', 'PATCH'],
      [RI, '/api/rider/credits/me', 'GET'],

      // Credit packages — listing (SA + RI)
      [SA, '/api/credits/packages', 'GET'],
      [RI, '/api/credits/packages', 'GET'],

      // Credit packages — management (SA only)
      [SA, '/api/credits/packages', 'POST'],
      [SA, '/api/credits/packages/:id', 'PATCH'],

      // Credit purchase flow (RI)
      [RI, '/api/credits/packages/:id/purchase', 'POST'],
      [RI, '/api/credits/my-balance', 'GET'],
      [RI, '/api/credits/my-history', 'GET'],

      // Admin views (SA only)
      [SA, '/api/credits/admin/purchases', 'GET'],
      [SA, '/api/credits/admin/rider-balances', 'GET'],
    ];

    for (const [role, route, method] of backend) {
      await queryRunner.query(
        `INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4)
         VALUES ('p', $1, $2, $3, 'allow', 'backend')
         ON CONFLICT DO NOTHING`,
        [role, route, method],
      );
    }

    const frontend: Array<[string, string]> = [
      [SA, '/dashboard/credits'],
    ];

    for (const [role, route] of frontend) {
      await queryRunner.query(
        `INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4)
         VALUES ('p', $1, $2, 'VIEW', 'allow', 'frontend')
         ON CONFLICT DO NOTHING`,
        [role, route],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const backendRoutes = [
      '/api/rider/:id/credits',
      '/api/rider/credits/me',
      '/api/credits/packages',
      '/api/credits/packages/:id',
      '/api/credits/packages/:id/purchase',
      '/api/credits/my-balance',
      '/api/credits/my-history',
      '/api/credits/admin/purchases',
      '/api/credits/admin/rider-balances',
    ];
    for (const route of backendRoutes) {
      await queryRunner.query(
        `DELETE FROM casbin_rule WHERE ptype = 'p' AND v4 = 'backend' AND v1 = $1`,
        [route],
      );
    }
    await queryRunner.query(
      `DELETE FROM casbin_rule WHERE ptype = 'p' AND v4 = 'frontend' AND v1 = '/dashboard/credits'`,
    );
  }
}
