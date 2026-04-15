import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentProofUrl1743800000000 implements MigrationInterface {
  name = 'AddPaymentProofUrl1743800000000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_proof_url TEXT NULL`,
    );
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(
      `ALTER TABLE orders DROP COLUMN IF EXISTS payment_proof_url`,
    );
  }
}
