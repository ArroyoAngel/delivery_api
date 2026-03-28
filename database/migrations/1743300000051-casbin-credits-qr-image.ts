import { MigrationInterface, QueryRunner } from 'typeorm';

export class CasbinCreditsQrImage1743300000051 implements MigrationInterface {
  name = 'CasbinCreditsQrImage1743300000051';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4)
      VALUES
        ('p', 'superadmin', '/api/credits/packages/:id/qr-image', 'POST',   'allow', 'backend'),
        ('p', 'superadmin', '/api/credits/packages/:id/qr-image', 'DELETE', 'allow', 'backend')
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`
      DELETE FROM casbin_rule
      WHERE ptype = 'p'
        AND v0 = 'superadmin'
        AND v1 = '/api/credits/packages/:id/qr-image'
    `);
  }
}
