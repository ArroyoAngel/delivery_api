import { MigrationInterface, QueryRunner } from 'typeorm';

export class TelegramSessions1742700000003 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS telegram_sessions (
        chat_id     bigint PRIMARY KEY,
        account_id  uuid REFERENCES accounts(id) ON DELETE CASCADE,
        messages    jsonb NOT NULL DEFAULT '[]',
        updated_at  timestamptz NOT NULL DEFAULT now()
      );
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS telegram_sessions;`);
  }
}
