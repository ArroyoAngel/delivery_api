import { MigrationInterface, QueryRunner } from 'typeorm';

export class EmailOtp1742600000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS email_otps (
        id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        email       VARCHAR     NOT NULL,
        code        VARCHAR(6)  NOT NULL,
        expires_at  TIMESTAMPTZ NOT NULL,
        used        BOOLEAN     NOT NULL DEFAULT false,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_email_otps_email ON email_otps (email)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS email_otps`);
  }
}
