import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreditPurchasesRejectionReason1743300000046 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE credit_purchases ADD COLUMN IF NOT EXISTS rejection_reason TEXT`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE credit_purchases DROP COLUMN IF EXISTS rejection_reason`,
    );
  }
}
