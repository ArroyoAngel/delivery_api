import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Casbin frontend routes for the /dashboard/my-market section.
 * Both admin and superadmin get access; the Sidebar filters display
 * based on the businessType of the admin's store (isMarket flag).
 */
export class CasbinMarket1742500000020 implements MigrationInterface {
  name = 'CasbinMarket1742500000020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const frontendRoutes: Array<[string, string]> = [
      ['admin',      '/dashboard/my-market'],
      ['superadmin', '/dashboard/my-market'],
      ['admin',      '/dashboard/my-market/services'],
      ['superadmin', '/dashboard/my-market/services'],
    ];

    for (const [role, route] of frontendRoutes) {
      await queryRunner.query(
        `INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4)
         VALUES ('p', $1, $2, 'VIEW', 'allow', 'frontend')
         ON CONFLICT DO NOTHING`,
        [role, route],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM casbin_rule
       WHERE ptype = 'p'
         AND v4 = 'frontend'
         AND v1 IN (
           '/dashboard/my-market',
           '/dashboard/my-market/services'
         )`,
    );
  }
}
