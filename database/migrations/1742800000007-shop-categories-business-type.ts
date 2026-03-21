import { MigrationInterface, QueryRunner } from 'typeorm';

export class ShopCategoriesBusinessType1742800000007 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE shop_categories
        ADD COLUMN IF NOT EXISTS business_type VARCHAR(50) NOT NULL DEFAULT 'restaurant'
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE shop_categories DROP COLUMN IF EXISTS business_type
    `);
  }
}
