import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreditPurchasesProofUrl1743300000043 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE credit_purchases ADD COLUMN IF NOT EXISTS proof_image_url TEXT`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE credit_purchases DROP COLUMN IF EXISTS proof_image_url`,
    );
  }
}
