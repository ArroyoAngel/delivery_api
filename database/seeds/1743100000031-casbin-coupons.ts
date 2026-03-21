import { MigrationInterface, QueryRunner } from 'typeorm';
import { RolEnum } from '../../src/authorization/rol.enum';

const { SUPERADMIN: SA, ADMIN: AD, CLIENT: CL, RIDER: RI } = RolEnum;

export class CasbinCoupons1743100000031 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const backend: Array<[string, string, string]> = [
      // Validar cupón — cualquier usuario autenticado (al crear pedido)
      [CL, '/api/coupons/validate', 'POST'],
      [RI, '/api/coupons/validate', 'POST'],
      [AD, '/api/coupons/validate', 'POST'],
      [SA, '/api/coupons/validate', 'POST'],
      // SA: control total — puede elegir tipo y absorbs_cost libremente
      [SA, '/api/coupons', 'POST'],
      [SA, '/api/coupons', 'GET'],
      [SA, '/api/coupons/:id/deactivate', 'PATCH'],
      [SA, '/api/coupons/:id/activate', 'PATCH'],
      // Admin de negocio: solo sus propios cupones, absorbs_cost forzado a 'shop'
      [AD, '/api/coupons/shop', 'POST'],
      [AD, '/api/coupons/shop', 'GET'],
      [AD, '/api/coupons/shop/:id/deactivate', 'PATCH'],
      [AD, '/api/coupons/shop/:id/activate', 'PATCH'],
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
      [SA, '/dashboard/coupons'],
      [AD, '/dashboard/coupons'],
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
    const routes = [
      '/api/coupons/validate',
      '/api/coupons',
      '/api/coupons/:id/deactivate',
      '/api/coupons/:id/activate',
      '/api/coupons/shop',
      '/api/coupons/shop/:id/deactivate',
      '/api/coupons/shop/:id/activate',
    ];
    for (const route of routes) {
      await queryRunner.query(
        `DELETE FROM casbin_rule WHERE ptype = 'p' AND v4 = 'backend' AND v1 = $1`,
        [route],
      );
    }
    await queryRunner.query(
      `DELETE FROM casbin_rule WHERE ptype = 'p' AND v4 = 'frontend' AND v1 = '/dashboard/coupons'`,
    );
  }
}
