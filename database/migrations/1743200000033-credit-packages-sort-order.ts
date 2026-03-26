import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreditPackagesSortOrder1743200000033 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE credit_packages
        ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE credit_packages DROP COLUMN IF EXISTS sort_order`);
  }
}
