import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreditPurchasesBnbFields1743200000035 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE credit_purchases
        ADD COLUMN IF NOT EXISTS bnb_qr_id   VARCHAR(128),
        ADD COLUMN IF NOT EXISTS bnb_qr_image TEXT,
        ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ
    `);

    // Extend status to allow 'cancelled'
    await queryRunner.query(`
      ALTER TABLE credit_purchases
        ALTER COLUMN status SET DEFAULT 'pending'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE credit_purchases
        DROP COLUMN IF EXISTS bnb_qr_id,
        DROP COLUMN IF EXISTS bnb_qr_image,
        DROP COLUMN IF EXISTS cancelled_at
    `);
  }
}
