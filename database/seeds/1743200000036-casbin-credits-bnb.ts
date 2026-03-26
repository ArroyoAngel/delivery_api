import { MigrationInterface, QueryRunner } from 'typeorm';
import { RolEnum } from '../../src/authorization/rol.enum';

const { SUPERADMIN: SA, RIDER: RI } = RolEnum;

export class CasbinCreditsBnb1743200000036 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Eliminar la ruta vieja (/purchase → reemplazada por /claim)
    await queryRunner.query(
      `DELETE FROM casbin_rule
       WHERE ptype = 'p' AND v4 = 'backend'
         AND v1 = '/api/credits/packages/:id/purchase'`,
    );

    const rules: Array<[string, string, string]> = [
      // Rider: iniciar compra con BNB
      [RI, '/api/credits/packages/:id/claim', 'POST'],
      // Rider: cancelar compra pendiente
      [RI, '/api/credits/purchases/:id', 'DELETE'],

      // Admin: confirmar pago manualmente
      [SA, '/api/credits/admin/confirm/:reference', 'POST'],
      // Admin: regenerar QR de paquetes
      [SA, '/api/credits/admin/refresh-qr', 'POST'],
    ];

    for (const [role, route, method] of rules) {
      await queryRunner.query(
        `INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4)
         VALUES ('p', $1, $2, $3, 'allow', 'backend')
         ON CONFLICT DO NOTHING`,
        [role, route, method],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const routes = [
      '/api/credits/packages/:id/claim',
      '/api/credits/purchases/:id',
      '/api/credits/admin/confirm/:reference',
      '/api/credits/admin/refresh-qr',
    ];
    for (const route of routes) {
      await queryRunner.query(
        `DELETE FROM casbin_rule WHERE ptype = 'p' AND v4 = 'backend' AND v1 = $1`,
        [route],
      );
    }
    // Restaurar la ruta vieja
    await queryRunner.query(
      `INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4)
       VALUES ('p', $1, '/api/credits/packages/:id/purchase', 'POST', 'allow', 'backend')
       ON CONFLICT DO NOTHING`,
      [RI],
    );
  }
}
