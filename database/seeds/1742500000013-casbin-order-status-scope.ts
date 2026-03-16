import { MigrationInterface, QueryRunner } from 'typeorm';
import { RolEnum } from '../../src/authorization/rol.enum';

const { SUPERADMIN: SA, ADMIN: AD, RIDER: RI } = RolEnum;

export class CasbinOrderStatusScope1742500000013 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // El endpoint genérico /orders/:id/status queda SOLO para superadmin.
    await queryRunner.query(
      `DELETE FROM casbin_rule
       WHERE ptype = 'p'
         AND v4 = 'backend'
         AND v0 = $1
         AND v1 = '/api/orders/:id/status'`,
      [AD],
    );

    await queryRunner.query(
      `INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4)
       VALUES ('p', $1, '/api/orders/:id/status', 'PUT', 'allow', 'backend')
       ON CONFLICT DO NOTHING`,
      [SA],
    );

    // Limpiar endpoint rider deprecated.
    await queryRunner.query(
      `DELETE FROM casbin_rule
       WHERE ptype = 'p'
         AND v4 = 'backend'
         AND v1 = '/api/rider/orders/:orderId/ready'`,
    );

    // Asegurar flujo de estados por rol.
    const routes: Array<[string, string, string]> = [
      [SA, '/api/orders/:id/preparing', 'PUT'],
      [AD, '/api/orders/:id/preparing', 'PUT'],
      [SA, '/api/orders/:id/ready', 'PUT'],
      [AD, '/api/orders/:id/ready', 'PUT'],
      [SA, '/api/orders/:id/on-the-way', 'PUT'],
      [RI, '/api/orders/:id/on-the-way', 'PUT'],
      [SA, '/api/orders/:id/done', 'PUT'],
      [RI, '/api/orders/:id/done', 'PUT'],
    ];

    for (const [role, route, method] of routes) {
      await queryRunner.query(
        `INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4)
         VALUES ('p', $1, $2, $3, 'allow', 'backend')
         ON CONFLICT DO NOTHING`,
        [role, route, method],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4)
       VALUES ('p', $1, '/api/orders/:id/status', 'PUT', 'allow', 'backend')
       ON CONFLICT DO NOTHING`,
      [AD],
    );

    await queryRunner.query(
      `INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4)
       VALUES ('p', $1, '/api/rider/orders/:orderId/ready', 'PUT', 'allow', 'backend')
       ON CONFLICT DO NOTHING`,
      [SA],
    );

    await queryRunner.query(
      `INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4)
       VALUES ('p', $1, '/api/rider/orders/:orderId/ready', 'PUT', 'allow', 'backend')
       ON CONFLICT DO NOTHING`,
      [AD],
    );
  }
}
