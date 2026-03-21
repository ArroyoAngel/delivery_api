import { MigrationInterface, QueryRunner } from 'typeorm';
import { RolEnum } from '../../src/authorization/rol.enum';

const { SUPERADMIN: SA, ADMIN: AD } = RolEnum;

export class CasbinFinanceRoutes1742500000011 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const backend: Array<[string, string, string]> = [
      [SA, '/api/payments/admin/summary', 'GET'],
      [SA, '/api/payments/admin/list', 'GET'],
      [SA, '/api/payments/admin/bank-accounts', 'GET'],
      [SA, '/api/payments/admin/withdrawals', 'GET'],
      [SA, '/api/payments/admin/withdrawals/:id/process', 'PUT'],
      [AD, '/api/payments/my/income', 'GET'],
      [AD, '/api/payments/my/bank-accounts', 'GET'],
      [AD, '/api/payments/my/withdrawals', 'GET'],
      [AD, '/api/payments/my/withdrawal', 'POST'],
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
      [SA, '/dashboard/payments'],
      [SA, '/dashboard/bank-accounts'],
      [SA, '/dashboard/withdrawals'],
      [AD, '/dashboard/my-shop/income'],
      [AD, '/dashboard/my-shop/bank-accounts'],
      [AD, '/dashboard/my-shop/withdrawals'],
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
      '/api/payments/admin/summary',
      '/api/payments/admin/list',
      '/api/payments/admin/bank-accounts',
      '/api/payments/admin/withdrawals',
      '/api/payments/my/income',
      '/api/payments/my/bank-accounts',
      '/api/payments/my/withdrawals',
    ];

    for (const route of backendRoutes) {
      await queryRunner.query(
        `DELETE FROM casbin_rule
         WHERE ptype = 'p'
           AND v4 = 'backend'
           AND v1 = $1
           AND v0 IN ($2, $3)`,
        [route, SA, AD],
      );
    }

    const frontendRoutes = [
      '/dashboard/payments',
      '/dashboard/bank-accounts',
      '/dashboard/withdrawals',
      '/dashboard/my-shop/income',
      '/dashboard/my-shop/bank-accounts',
      '/dashboard/my-shop/withdrawals',
    ];

    for (const route of frontendRoutes) {
      await queryRunner.query(
        `DELETE FROM casbin_rule
         WHERE ptype = 'p'
           AND v4 = 'frontend'
           AND v1 = $1
           AND v0 IN ($2, $3)`,
        [route, SA, AD],
      );
    }
  }
}
