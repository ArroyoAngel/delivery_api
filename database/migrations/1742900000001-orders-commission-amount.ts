import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrdersCommissionAmount1742900000001 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS commission_amount DECIMAL(10,2) NOT NULL DEFAULT 0
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE orders DROP COLUMN IF EXISTS commission_amount`);
  }
}
