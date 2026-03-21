import { MigrationInterface, QueryRunner } from 'typeorm';
import { RolEnum } from '../../src/authorization/rol.enum';

const { SUPERADMIN: SA, RIDER: RI, CLIENT: CL, ADMIN: AD } = RolEnum;

export class CasbinSupportRiderBank1742500000030 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const backend: Array<[string, string, string]> = [
      // Support tickets — cualquier usuario autenticado puede crear/ver los suyos
      [CL, '/api/support/tickets', 'POST'],
      [CL, '/api/support/tickets', 'GET'],
      [RI, '/api/support/tickets', 'POST'],
      [RI, '/api/support/tickets', 'GET'],
      [AD, '/api/support/tickets', 'POST'],
      [AD, '/api/support/tickets', 'GET'],
      // Support tickets — admin
      [SA, '/api/support/admin/tickets', 'GET'],
      [SA, '/api/support/admin/tickets/:id', 'PATCH'],

      // Rider bank accounts
      [RI, '/api/payments/rider/bank-accounts', 'GET'],
      [RI, '/api/payments/rider/bank-accounts', 'POST'],
      [RI, '/api/payments/rider/bank-accounts/:id', 'DELETE'],

      // Rider earnings & withdrawals
      [RI, '/api/payments/rider/income', 'GET'],
      [RI, '/api/payments/rider/withdrawals', 'GET'],
      [RI, '/api/payments/rider/withdrawal', 'POST'],
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
      [CL, '/dashboard/support'],
      [RI, '/dashboard/support'],
      [AD, '/dashboard/support'],
      [SA, '/dashboard/support'],
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
      '/api/support/tickets',
      '/api/support/admin/tickets',
      '/api/support/admin/tickets/:id',
      '/api/payments/rider/bank-accounts',
      '/api/payments/rider/bank-accounts/:id',
      '/api/payments/rider/income',
      '/api/payments/rider/withdrawals',
      '/api/payments/rider/withdrawal',
    ];
    for (const route of routes) {
      await queryRunner.query(
        `DELETE FROM casbin_rule WHERE ptype = 'p' AND v4 = 'backend' AND v1 = $1`,
        [route],
      );
    }
  }
}
