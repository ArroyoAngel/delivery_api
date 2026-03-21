import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameRestaurantToShop1742800000001 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    // 1. Rename tables (IF EXISTS: safe when clean-schema already uses new names)
    await qr.query(`ALTER TABLE IF EXISTS restaurants RENAME TO shops`);
    await qr.query(`ALTER TABLE IF EXISTS restaurant_categories RENAME TO shop_categories`);
    await qr.query(`ALTER TABLE IF EXISTS restaurant_schedules RENAME TO shop_schedules`);
    await qr.query(`ALTER TABLE IF EXISTS restaurant_bank_accounts RENAME TO shop_bank_accounts`);

    // 2. Rename sequences (PostgreSQL auto-creates sequences for serial/uuid PKs)
    // These may or may not exist depending on how PKs were created — use IF EXISTS
    await qr.query(`ALTER SEQUENCE IF EXISTS restaurants_id_seq RENAME TO shops_id_seq`);
    await qr.query(`ALTER SEQUENCE IF EXISTS restaurant_categories_id_seq RENAME TO shop_categories_id_seq`);
    await qr.query(`ALTER SEQUENCE IF EXISTS restaurant_schedules_id_seq RENAME TO shop_schedules_id_seq`);
    await qr.query(`ALTER SEQUENCE IF EXISTS restaurant_bank_accounts_id_seq RENAME TO shop_bank_accounts_id_seq`);

    // 3. Rename FK columns: restaurant_id → shop_id (IF EXISTS: safe when clean-schema already uses new names)
    await qr.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='restaurant_id') THEN ALTER TABLE orders RENAME COLUMN restaurant_id TO shop_id; END IF; END $$`);
    await qr.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='menu_items' AND column_name='restaurant_id') THEN ALTER TABLE menu_items RENAME COLUMN restaurant_id TO shop_id; END IF; END $$`);
    await qr.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='menu_categories' AND column_name='restaurant_id') THEN ALTER TABLE menu_categories RENAME COLUMN restaurant_id TO shop_id; END IF; END $$`);
    // In ratings table (if exists)
    await qr.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ratings' AND column_name='restaurant_id') THEN ALTER TABLE ratings RENAME COLUMN restaurant_id TO shop_id; END IF; END $$`);
    // In riders table (if has restaurant_id)
    await qr.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='riders' AND column_name='restaurant_id') THEN ALTER TABLE riders RENAME COLUMN restaurant_id TO shop_id; END IF; END $$`);
    // In delivery_zones table (if has restaurant_id)
    await qr.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_zones' AND column_name='restaurant_id') THEN ALTER TABLE delivery_zones RENAME COLUMN restaurant_id TO shop_id; END IF; END $$`);
    // In admins table: rename restaurant_id → shop_id if exists
    await qr.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='admins' AND column_name='restaurant_id') THEN ALTER TABLE admins RENAME COLUMN restaurant_id TO shop_id; END IF; END $$`);
    // In shop_bank_accounts (already renamed table): rename restaurant_id → shop_id if exists
    await qr.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shop_bank_accounts' AND column_name='restaurant_id') THEN ALTER TABLE shop_bank_accounts RENAME COLUMN restaurant_id TO shop_id; END IF; END $$`);
    // In withdrawal_requests table
    await qr.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='withdrawal_requests' AND column_name='restaurant_id') THEN ALTER TABLE withdrawal_requests RENAME COLUMN restaurant_id TO shop_id; END IF; END $$`);
    // In notifications table
    await qr.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notifications' AND column_name='restaurant_id') THEN ALTER TABLE notifications RENAME COLUMN restaurant_id TO shop_id; END IF; END $$`);
    // In shop_schedules (already renamed): rename restaurant_id → shop_id
    await qr.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shop_schedules' AND column_name='restaurant_id') THEN ALTER TABLE shop_schedules RENAME COLUMN restaurant_id TO shop_id; END IF; END $$`);

    // 4. Rename restaurant_service_areas: rename restaurant_id → shop_id
    await qr.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='restaurant_service_areas') AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='restaurant_service_areas' AND column_name='restaurant_id') THEN ALTER TABLE restaurant_service_areas RENAME COLUMN restaurant_id TO shop_id; END IF; END $$`);

    // 5. Update Casbin rules: /api/restaurants → /api/shops
    await qr.query(`UPDATE casbin_rule SET v1 = REPLACE(v1, '/api/restaurants', '/api/shops') WHERE v1 LIKE '%/api/restaurants%'`);
    // Update /api/orders/restaurant/ → /api/orders/shop/
    await qr.query(`UPDATE casbin_rule SET v1 = REPLACE(v1, '/api/orders/restaurant/', '/api/orders/shop/') WHERE v1 LIKE '%/api/orders/restaurant/%'`);
    // Also update frontend routes
    await qr.query(`UPDATE casbin_rule SET v1 = REPLACE(v1, '/dashboard/restaurants', '/dashboard/shops') WHERE v1 LIKE '%/dashboard/restaurants%'`);
    await qr.query(`UPDATE casbin_rule SET v1 = REPLACE(v1, '/dashboard/my-restaurant', '/dashboard/my-shop') WHERE v1 LIKE '%/dashboard/my-restaurant%'`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE shops RENAME TO restaurants`);
    await qr.query(`ALTER TABLE shop_categories RENAME TO restaurant_categories`);
    await qr.query(`ALTER TABLE shop_schedules RENAME TO restaurant_schedules`);
    await qr.query(`ALTER TABLE shop_bank_accounts RENAME TO restaurant_bank_accounts`);
    // Reverse FK columns
    await qr.query(`ALTER TABLE orders RENAME COLUMN shop_id TO restaurant_id`);
    await qr.query(`ALTER TABLE menu_items RENAME COLUMN shop_id TO restaurant_id`);
    await qr.query(`ALTER TABLE menu_categories RENAME COLUMN shop_id TO restaurant_id`);
    await qr.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ratings' AND column_name='shop_id') THEN ALTER TABLE ratings RENAME COLUMN shop_id TO restaurant_id; END IF; END $$`);
    // Reverse Casbin
    await qr.query(`UPDATE casbin_rule SET v1 = REPLACE(v1, '/api/shops', '/api/restaurants') WHERE v1 LIKE '%/api/shops%'`);
    await qr.query(`UPDATE casbin_rule SET v1 = REPLACE(v1, '/dashboard/shops', '/dashboard/restaurants') WHERE v1 LIKE '%/dashboard/shops%'`);
    await qr.query(`UPDATE casbin_rule SET v1 = REPLACE(v1, '/dashboard/my-shop', '/dashboard/my-restaurant') WHERE v1 LIKE '%/dashboard/my-shop%'`);
  }
}
