import { MigrationInterface, QueryRunner } from 'typeorm';

export class ShopsQrImageUrl1743300000047 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE shops ADD COLUMN IF NOT EXISTS qr_image_url TEXT`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE shops DROP COLUMN IF EXISTS qr_image_url`,
    );
  }
}
