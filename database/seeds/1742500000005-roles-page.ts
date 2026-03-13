import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * - Elimina /dashboard/staff del superadmin (no necesita "Mi Personal")
 * - Agrega /dashboard/roles al superadmin (gestión de permisos de roles)
 * - Agrega reglas Casbin backend para el nuevo endpoint /api/roles
 */
export class RolesPage1742500000005 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Quitar /dashboard/staff de superadmin
    await queryRunner.query(
      `DELETE FROM casbin_rule
       WHERE ptype='p' AND v0='superadmin' AND v1='/dashboard/staff' AND v4='frontend'`,
    );

    // Agregar /dashboard/roles a superadmin (frontend)
    await queryRunner.query(
      `INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4)
       VALUES ('p', 'superadmin', '/dashboard/roles', 'VIEW', 'allow', 'frontend')`,
    );

    // Reglas backend para el módulo de roles (solo superadmin)
    await queryRunner.query(
      `INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4)
       VALUES ('p', 'superadmin', '/api/roles/permissions', 'GET', 'allow', 'backend')`,
    );
    await queryRunner.query(
      `INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4)
       VALUES ('p', 'superadmin', '/api/roles/:role/permissions', 'PUT', 'allow', 'backend')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4)
       VALUES ('p', 'superadmin', '/dashboard/staff', 'VIEW', 'allow', 'frontend')`,
    );
    await queryRunner.query(
      `DELETE FROM casbin_rule
       WHERE ptype='p' AND v0='superadmin' AND v1='/dashboard/roles'`,
    );
    await queryRunner.query(
      `DELETE FROM casbin_rule
       WHERE ptype='p' AND v0='superadmin' AND v1 IN ('/api/roles/permissions', '/api/roles/:role/permissions')`,
    );
  }
}
