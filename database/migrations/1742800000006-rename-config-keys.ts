import { MigrationInterface, QueryRunner } from 'typeorm';
export class RenameConfigKeys1742800000006 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      UPDATE system_config SET key = 'nearby_shop_radius_meters'
      WHERE key = 'nearby_restaurant_radius_meters'
        AND NOT EXISTS (SELECT 1 FROM system_config WHERE key = 'nearby_shop_radius_meters')
    `);
    await qr.query(`
      UPDATE system_config SET key = 'shop_commission_pct'
      WHERE key = 'restaurant_commission_pct'
        AND NOT EXISTS (SELECT 1 FROM system_config WHERE key = 'shop_commission_pct')
    `);
  }
  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`
      UPDATE system_config SET key = 'nearby_restaurant_radius_meters'
      WHERE key = 'nearby_shop_radius_meters'
        AND NOT EXISTS (SELECT 1 FROM system_config WHERE key = 'nearby_restaurant_radius_meters')
    `);
    await qr.query(`
      UPDATE system_config SET key = 'restaurant_commission_pct'
      WHERE key = 'shop_commission_pct'
        AND NOT EXISTS (SELECT 1 FROM system_config WHERE key = 'restaurant_commission_pct')
    `);
  }
}
