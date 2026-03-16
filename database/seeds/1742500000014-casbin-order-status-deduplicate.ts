import { MigrationInterface, QueryRunner } from 'typeorm';
import { RolEnum } from '../../src/authorization/rol.enum';

const { SUPERADMIN: SA, ADMIN: AD, RIDER: RI } = RolEnum;

export class CasbinOrderStatusDeduplicate1742500000014 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Reescribe todas las reglas de estado para evitar duplicados y asegurar una matriz canónica.
    await queryRunner.query(
      `DELETE FROM casbin_rule
       WHERE ptype = 'p'
         AND v4 = 'backend'
         AND v1 IN (
           '/api/orders/:id/status',
           '/api/orders/:id/preparing',
           '/api/orders/:id/ready',
           '/api/orders/:id/on-the-way',
           '/api/orders/:id/done',
           '/api/rider/orders/:orderId/ready'
         )`,
    );

    const rules: Array<[string, string, string]> = [
      [SA, '/api/orders/:id/status', 'PUT'],
      [SA, '/api/orders/:id/preparing', 'PUT'],
      [AD, '/api/orders/:id/preparing', 'PUT'],
      [SA, '/api/orders/:id/ready', 'PUT'],
      [AD, '/api/orders/:id/ready', 'PUT'],
      [SA, '/api/orders/:id/on-the-way', 'PUT'],
      [RI, '/api/orders/:id/on-the-way', 'PUT'],
      [SA, '/api/orders/:id/done', 'PUT'],
      [RI, '/api/orders/:id/done', 'PUT'],
    ];

    for (const [role, route, method] of rules) {
      await queryRunner.query(
        `INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4)
         VALUES ('p', $1, $2, $3, 'allow', 'backend')`,
        [role, route, method],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM casbin_rule
       WHERE ptype = 'p'
         AND v4 = 'backend'
         AND v1 IN (
           '/api/orders/:id/status',
           '/api/orders/:id/preparing',
           '/api/orders/:id/ready',
           '/api/orders/:id/on-the-way',
           '/api/orders/:id/done'
         )`,
    );

    // Estado base anterior: endpoint genérico para admin y superadmin.
    await queryRunner.query(
      `INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4)
       VALUES ('p', $1, '/api/orders/:id/status', 'PUT', 'allow', 'backend')`,
      [SA],
    );

    await queryRunner.query(
      `INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4)
       VALUES ('p', $1, '/api/orders/:id/status', 'PUT', 'allow', 'backend')`,
      [AD],
    );
  }
}