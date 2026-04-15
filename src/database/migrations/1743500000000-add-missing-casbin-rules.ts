import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMissingCasbinRules1743500000000 implements MigrationInterface {
  name = 'AddMissingCasbinRules1743500000000';

  private async insert(
    qr: QueryRunner,
    rules: Array<[string, string, string, string]>,
  ): Promise<void> {
    for (const [v0, v1, v2, v4] of rules) {
      await qr.query(
        `INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4)
         VALUES ('p', $1, $2, $3, 'allow', $4)
         ON CONFLICT (ptype, v0, v1, v2, v3, v4) DO NOTHING`,
        [v0, v1, v2, v4],
      );
    }
  }

  public async up(qr: QueryRunner): Promise<void> {
    const SA = 'superadmin';
    const AD = 'admin';
    const BE = 'backend';

    await this.insert(qr, [
      [SA, '/api/shops/:id/upload-image', 'POST', BE],
      [AD, '/api/shops/:id/upload-image', 'POST', BE],
      [SA, '/api/shops/:id/image', 'DELETE', BE],
      [AD, '/api/shops/:id/image', 'DELETE', BE],
      [SA, '/api/shops/:id/categories', 'POST', BE],
      [AD, '/api/shops/:id/categories', 'POST', BE],
    ]);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(
      `DELETE FROM casbin_rule
       WHERE v1 IN ('/api/shops/:id/upload-image', '/api/shops/:id/categories')
       AND v2 = 'POST'`,
    );
  }
}
