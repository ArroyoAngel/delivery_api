import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentConfirmationCasbinRules1743850000000 implements MigrationInterface {
  name = 'AddPaymentConfirmationCasbinRules1743850000000';

  private async insert(
    qr: QueryRunner,
    rules: Array<[string, string, string, string]>,
  ): Promise<void> {
    for (const [v0, v1, v2, v4] of rules) {
      await qr.query(
        `INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4)
         VALUES ('p', $1, $2, $3, 'allow', $4)
         ON CONFLICT DO NOTHING`,
        [v0, v1, v2, v4],
      );
    }
  }

  public async up(qr: QueryRunner): Promise<void> {
    const SA = 'superadmin';
    const BE = 'backend';

    await this.insert(qr, [
      [SA, '/api/orders/:id/confirm-manual', 'POST', BE],
      [SA, '/api/orders/:id/reject-payment', 'POST', BE],
    ]);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(
      `DELETE FROM casbin_rule
       WHERE v1 IN ('/api/orders/:id/confirm-manual', '/api/orders/:id/reject-payment')
       AND v2 = 'POST'`,
    );
  }
}
