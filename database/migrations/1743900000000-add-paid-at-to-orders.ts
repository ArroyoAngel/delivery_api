import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaidAtToOrders1743900000000 implements MigrationInterface {
  name = 'AddPaidAtToOrders1743900000000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP NULL`,
    );
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE orders DROP COLUMN IF EXISTS paid_at`);
  }
}
