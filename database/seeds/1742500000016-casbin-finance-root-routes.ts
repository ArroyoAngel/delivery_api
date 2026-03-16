import { DataSource } from 'typeorm';
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CasbinFinanceRootRoutes1742500000016 implements MigrationInterface {
  name = 'CasbinFinanceRootRoutes1742500000016';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Eliminar rutas my-restaurant/* del rol admin (frontend) ─────────────
    await queryRunner.query(
      `DELETE FROM casbin_rule
       WHERE ptype = 'p'
         AND v0 = 'admin'
         AND v4 = 'frontend'
         AND v1 IN (
           '/dashboard/my-restaurant/income',
           '/dashboard/my-restaurant/bank-accounts',
           '/dashboard/my-restaurant/withdrawals'
         )`,
    );

    // ── Agregar rutas raíz de finanzas al rol admin (frontend) ─────────────
    const adminFinanceRoutes = [
      '/dashboard/income',
      '/dashboard/bank-accounts',
      '/dashboard/withdrawals',
    ];
    for (const route of adminFinanceRoutes) {
      await queryRunner.query(
        `INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4)
         VALUES ('p', 'admin', $1, 'VIEW', 'allow', 'frontend')
         ON CONFLICT DO NOTHING`,
        [route],
      );
    }

    // ── Agregar /dashboard/income al rol superadmin (frontend) ─────────────
    await queryRunner.query(
      `INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4)
       VALUES ('p', 'superadmin', '/dashboard/income', 'VIEW', 'allow', 'frontend')
       ON CONFLICT DO NOTHING`,
    );

    // ── Agregar endpoints backend per-restaurante al rol superadmin ────────
    const saBackendRoutes = [
      '/api/payments/admin/restaurant/:id/income',
      '/api/payments/admin/restaurant/:id/bank-accounts',
      '/api/payments/admin/restaurant/:id/withdrawals',
    ];
    for (const route of saBackendRoutes) {
      await queryRunner.query(
        `INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4)
         VALUES ('p', 'superadmin', $1, 'GET', 'allow', 'backend')
         ON CONFLICT DO NOTHING`,
        [route],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Eliminar rutas raíz de admin
    await queryRunner.query(
      `DELETE FROM casbin_rule
       WHERE ptype = 'p'
         AND v0 = 'admin'
         AND v4 = 'frontend'
         AND v1 IN (
           '/dashboard/income',
           '/dashboard/bank-accounts',
           '/dashboard/withdrawals'
         )`,
    );

    // Eliminar /dashboard/income de superadmin
    await queryRunner.query(
      `DELETE FROM casbin_rule
       WHERE ptype = 'p'
         AND v0 = 'superadmin'
         AND v4 = 'frontend'
         AND v1 = '/dashboard/income'`,
    );

    // Eliminar backend per-restaurante de superadmin
    await queryRunner.query(
      `DELETE FROM casbin_rule
       WHERE ptype = 'p'
         AND v0 = 'superadmin'
         AND v4 = 'backend'
         AND v1 IN (
           '/api/payments/admin/restaurant/:id/income',
           '/api/payments/admin/restaurant/:id/bank-accounts',
           '/api/payments/admin/restaurant/:id/withdrawals'
         )`,
    );

    // Restaurar rutas my-restaurant/* al rol admin
    const adminMyRoutes = [
      '/dashboard/my-restaurant/income',
      '/dashboard/my-restaurant/bank-accounts',
      '/dashboard/my-restaurant/withdrawals',
    ];
    for (const route of adminMyRoutes) {
      await queryRunner.query(
        `INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4)
         VALUES ('p', 'admin', $1, 'VIEW', 'allow', 'frontend')`,
        [route],
      );
    }
  }
}
