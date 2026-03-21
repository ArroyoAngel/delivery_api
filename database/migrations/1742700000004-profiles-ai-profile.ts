import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProfilesAiProfile1742700000004 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE profiles
        ADD COLUMN IF NOT EXISTS ai_profile jsonb NOT NULL DEFAULT '{}';
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE profiles DROP COLUMN IF EXISTS ai_profile;
    `);
  }
}
