import { MigrationInterface, QueryRunner } from 'typeorm';

export class AccountPhoneId1742600000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS phone_id VARCHAR UNIQUE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE accounts DROP COLUMN IF EXISTS phone_id`,
    );
  }
}
