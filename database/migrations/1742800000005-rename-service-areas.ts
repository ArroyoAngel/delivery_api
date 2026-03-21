import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameServiceAreas1742800000005 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE IF EXISTS restaurant_service_areas RENAME TO shop_service_areas`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE shop_service_areas RENAME TO restaurant_service_areas`);
  }
}
