import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Roles base del sistema. Los 4 roles raíz son inmutables (is_system = true).
 * Sub-roles futuros derivan de estos usando parent_id.
 *
 * profile_type indica qué tabla de perfil extendido usa el rol:
 *   'admin'  → tabla admins
 *   'rider'  → tabla riders
 *   'client' → tabla clients
 *   NULL     → sin perfil extendido (superadmin)
 */
export class Roles1742500000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO roles (name, parent_id, profile_type, is_system, description) VALUES
        ('superadmin', NULL, NULL,     true,  'Administrador global de la plataforma'),
        ('admin',      NULL, 'admin',  true,  'Administrador de restaurante'),
        ('rider',      NULL, 'rider',  true,  'Repartidor'),
        ('client',     NULL, 'client', true,  'Cliente')
      ON CONFLICT (name) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM roles WHERE is_system = true`);
  }
}
