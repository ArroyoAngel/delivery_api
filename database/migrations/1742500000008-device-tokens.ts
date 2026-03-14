import { MigrationInterface, QueryRunner } from 'typeorm';

export class DeviceTokens1742500000008 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS device_tokens (
        id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id    VARCHAR     NOT NULL,
        token      TEXT        NOT NULL UNIQUE,
        platform   VARCHAR(10) NOT NULL DEFAULT 'android',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_device_tokens_user_id ON device_tokens(user_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS device_tokens`);
  }
}
