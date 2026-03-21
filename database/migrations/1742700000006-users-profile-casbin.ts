import { MigrationInterface, QueryRunner } from 'typeorm';

export class UsersProfileCasbin1742700000006 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    const roles = ['client', 'rider', 'admin', 'superadmin', 'shop_staff'];

    // API: PATCH /api/users/profile (backend)
    for (const role of roles) {
      await qr.query(
        `INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4)
         VALUES ('p', $1, '/api/users/profile', 'PATCH', 'allow', 'backend')
         ON CONFLICT DO NOTHING`,
        [role],
      );
    }

    // Frontend: /dashboard/profile page (visible in sidebar for all roles)
    for (const role of roles) {
      await qr.query(
        `INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4)
         VALUES ('p', $1, '/dashboard/profile', 'GET', 'allow', 'frontend')
         ON CONFLICT DO NOTHING`,
        [role],
      );
    }
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(
      `DELETE FROM casbin_rule
       WHERE ptype = 'p'
         AND v1 IN ('/api/users/profile', '/dashboard/profile')`,
    );
  }
}
