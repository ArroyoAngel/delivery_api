import { MigrationInterface, QueryRunner } from 'typeorm';
import { RolEnum } from '../../src/authorization/rol.enum';

const { ADMIN: AD, SUPERADMIN: SA } = RolEnum;

/**
 * Ajuste de alcance para admin restaurante:
 * - No debe ver ni consumir módulos globales de riders.
 * - Superadmin mantiene acceso completo.
 */
export class CasbinAdminRiderScopeHardening1742500000015 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const adminBackend = [
      '/api/rider/list',
      '/api/rider/:id/location-history/dates',
      '/api/rider/:id/deliveries',
    ];

    for (const route of adminBackend) {
      await queryRunner.query(
        `DELETE FROM casbin_rule
         WHERE ptype = 'p' AND v4 = 'backend' AND v0 = $1 AND v1 = $2`,
        [AD, route],
      );
    }

    const adminFrontend = ['/dashboard/riders'];

    for (const route of adminFrontend) {
      await queryRunner.query(
        `DELETE FROM casbin_rule
         WHERE ptype = 'p' AND v4 = 'frontend' AND v0 = $1 AND v1 = $2`,
        [AD, route],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const adminBackend: Array<[string, string]> = [
      ['/api/rider/list', 'GET'],
      ['/api/rider/:id/location-history/dates', 'GET'],
      ['/api/rider/:id/deliveries', 'GET'],
    ];

    for (const [route, method] of adminBackend) {
      await queryRunner.query(
        `INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4)
         VALUES ('p', $1, $2, $3, 'allow', 'backend')
         ON CONFLICT DO NOTHING`,
        [AD, route, method],
      );
    }

    await queryRunner.query(
      `INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4)
       VALUES ('p', $1, '/dashboard/riders', 'VIEW', 'allow', 'frontend')
       ON CONFLICT DO NOTHING`,
      [AD],
    );

    const superadminBackend: Array<[string, string]> = [
      ['/api/rider/list', 'GET'],
      ['/api/rider/:id/location-history/dates', 'GET'],
      ['/api/rider/:id/deliveries', 'GET'],
    ];

    for (const [route, method] of superadminBackend) {
      await queryRunner.query(
        `INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4)
         VALUES ('p', $1, $2, $3, 'allow', 'backend')
         ON CONFLICT DO NOTHING`,
        [SA, route, method],
      );
    }

    await queryRunner.query(
      `INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4)
       VALUES ('p', $1, '/dashboard/riders', 'VIEW', 'allow', 'frontend')
       ON CONFLICT DO NOTHING`,
      [SA],
    );
  }
}
