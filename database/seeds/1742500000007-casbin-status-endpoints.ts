import { MigrationInterface, QueryRunner } from 'typeorm';
import { RolEnum } from '../../src/authorization/rol.enum';

const { SUPERADMIN: SA, ADMIN: AD, RIDER: RI } = RolEnum;

/**
 * Políticas CASBIN para los endpoints de transición de estado de órdenes.
 *
 * ADMIN:  /orders/:id/preparing  — confirmado → preparando
 *         /orders/:id/ready      — preparando → listo
 * RIDER:  /orders/:id/on-the-way — listo → en_camino (rider recogió)
 *         /orders/:id/done       — en_camino → entregado (rider entregó)
 */
export class CasbinStatusEndpoints1742500000007 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const rules: Array<[string, string, string]> = [
      [SA, '/api/orders/:id/preparing',  'PUT'],
      [AD, '/api/orders/:id/preparing',  'PUT'],
      [SA, '/api/orders/:id/ready',      'PUT'],
      [AD, '/api/orders/:id/ready',      'PUT'],
      [SA, '/api/orders/:id/on-the-way', 'PUT'],
      [RI, '/api/orders/:id/on-the-way', 'PUT'],
      [SA, '/api/orders/:id/done',       'PUT'],
      [RI, '/api/orders/:id/done',       'PUT'],
    ];

    for (const [role, route, actions] of rules) {
      await queryRunner.query(
        `INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4)
         VALUES ('p', $1, $2, $3, 'allow', 'backend')
         ON CONFLICT DO NOTHING`,
        [role, route, actions],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const routes = [
      '/api/orders/:id/preparing',
      '/api/orders/:id/ready',
      '/api/orders/:id/on-the-way',
      '/api/orders/:id/done',
    ];
    for (const route of routes) {
      await queryRunner.query(`DELETE FROM casbin_rule WHERE v1 = $1`, [route]);
    }
  }
}
