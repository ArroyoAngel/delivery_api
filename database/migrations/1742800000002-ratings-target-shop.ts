import { MigrationInterface, QueryRunner } from 'typeorm';

export class RatingsTargetShop1742800000002 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(
      `DO $$ BEGIN
         IF EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_name='ratings' AND column_name='target_restaurant_id'
         ) THEN
           ALTER TABLE ratings RENAME COLUMN target_restaurant_id TO target_shop_id;
         END IF;
       END $$`,
    );
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(
      `DO $$ BEGIN
         IF EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_name='ratings' AND column_name='target_shop_id'
         ) THEN
           ALTER TABLE ratings RENAME COLUMN target_shop_id TO target_restaurant_id;
         END IF;
       END $$`,
    );
  }
}
