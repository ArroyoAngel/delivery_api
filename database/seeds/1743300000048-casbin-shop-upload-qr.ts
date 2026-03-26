import { MigrationInterface, QueryRunner } from 'typeorm';

export class CasbinShopUploadQr1743300000048 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    const rules: Array<[string, string, string]> = [
      ['superadmin', '/api/shops/:id/upload-qr', 'POST'],
      ['admin',      '/api/shops/:id/upload-qr', 'POST'],
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

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM casbin_rule
       WHERE ptype = 'p' AND v4 = 'backend'
         AND v1 = '/api/shops/:id/upload-qr' AND v2 = 'POST'`,
    );
  }
}
