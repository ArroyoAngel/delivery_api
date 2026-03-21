import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Limpia el prompt de cliente guardado en system_config para que
 * la app use el prompt por defecto actualizado (sin "Fee de envío").
 */
export class ResetClientPrompt1742700000005 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM system_config WHERE key = 'ai_prompt_client';
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // No restaurar — el prompt por defecto es la fuente de verdad
  }
}
