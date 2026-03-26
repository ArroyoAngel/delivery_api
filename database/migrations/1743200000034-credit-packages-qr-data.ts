import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreditPackagesQrData1743200000034 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE credit_packages
        ADD COLUMN IF NOT EXISTS qr_data TEXT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE credit_packages DROP COLUMN IF EXISTS qr_data`);
  }
}
