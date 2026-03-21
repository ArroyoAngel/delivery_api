import { MigrationInterface, QueryRunner } from 'typeorm';
import { RolEnum } from '../../src/authorization/rol.enum';

const { SUPERADMIN: SA, ADMIN: AD } = RolEnum;

export class CasbinFinanceScopeHardening1742500000012 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const adminGlobalBackend = [
      '/api/payments/admin/summary',
      '/api/payments/admin/list',
      '/api/payments/admin/bank-accounts',
      '/api/payments/admin/withdrawals',
    ];

    const adminGlobalFrontend = [
      '/dashboard/payments',
      '/dashboard/bank-accounts',
      '/dashboard/withdrawals',
    ];

    for (const route of adminGlobalBackend) {
      await queryRunner.query(
        `DELETE FROM casbin_rule
         WHERE ptype = 'p' AND v4 = 'backend' AND v0 = $1 AND v1 = $2`,
        [AD, route],
      );
    }

    for (const route of adminGlobalFrontend) {
      await queryRunner.query(
        `DELETE FROM casbin_rule
         WHERE ptype = 'p' AND v4 = 'frontend' AND v0 = $1 AND v1 = $2`,
        [AD, route],
      );
    }

    const adminMyBackend: Array<[string, string]> = [
      ['/api/payments/my/income', 'GET'],
      ['/api/payments/my/bank-accounts', 'GET'],
      ['/api/payments/my/withdrawals', 'GET'],
    ];

    for (const [route, method] of adminMyBackend) {
      await queryRunner.query(
        `INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4)
         VALUES ('p', $1, $2, $3, 'allow', 'backend')
         ON CONFLICT DO NOTHING`,
        [AD, route, method],
      );
    }

    const adminMyFrontend = [
      '/dashboard/my-shop/income',
      '/dashboard/my-shop/bank-accounts',
      '/dashboard/my-shop/withdrawals',
    ];

    for (const route of adminMyFrontend) {
      await queryRunner.query(
        `INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4)
         VALUES ('p', $1, $2, 'VIEW', 'allow', 'frontend')
         ON CONFLICT DO NOTHING`,
        [AD, route],
      );
    }

    const superadminGlobalBackend: Array<[string, string]> = [
      ['/api/payments/admin/summary', 'GET'],
      ['/api/payments/admin/list', 'GET'],
      ['/api/payments/admin/bank-accounts', 'GET'],
      ['/api/payments/admin/withdrawals', 'GET'],
    ];

    for (const [route, method] of superadminGlobalBackend) {
      await queryRunner.query(
        `INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4)
         VALUES ('p', $1, $2, $3, 'allow', 'backend')
         ON CONFLICT DO NOTHING`,
        [SA, route, method],
      );
    }

    const superadminGlobalFrontend = [
      '/dashboard/payments',
      '/dashboard/bank-accounts',
      '/dashboard/withdrawals',
    ];

    for (const route of superadminGlobalFrontend) {
      await queryRunner.query(
        `INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4)
         VALUES ('p', $1, $2, 'VIEW', 'allow', 'frontend')
         ON CONFLICT DO NOTHING`,
        [SA, route],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const adminMyBackend = [
      '/api/payments/my/income',
      '/api/payments/my/bank-accounts',
      '/api/payments/my/withdrawals',
    ];

    for (const route of adminMyBackend) {
      await queryRunner.query(
        `DELETE FROM casbin_rule
         WHERE ptype = 'p' AND v4 = 'backend' AND v0 = $1 AND v1 = $2`,
        [AD, route],
      );
    }

    const adminMyFrontend = [
      '/dashboard/my-shop/income',
      '/dashboard/my-shop/bank-accounts',
      '/dashboard/my-shop/withdrawals',
    ];

    for (const route of adminMyFrontend) {
      await queryRunner.query(
        `DELETE FROM casbin_rule
         WHERE ptype = 'p' AND v4 = 'frontend' AND v0 = $1 AND v1 = $2`,
        [AD, route],
      );
    }
  }
}
