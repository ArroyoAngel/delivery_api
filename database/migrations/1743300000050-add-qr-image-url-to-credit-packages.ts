import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddQrImageUrlToCreditPackages1743300000050 implements MigrationInterface {
  name = 'AddQrImageUrlToCreditPackages1743300000050';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE credit_packages ADD COLUMN IF NOT EXISTS qr_image_url TEXT`);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE credit_packages DROP COLUMN IF EXISTS qr_image_url`);
  }
}
