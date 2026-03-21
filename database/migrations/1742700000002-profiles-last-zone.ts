import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProfilesLastZone1742700000002 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE profiles
        ADD COLUMN IF NOT EXISTS last_zone_id uuid
          REFERENCES delivery_zones(id) ON DELETE SET NULL;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE profiles DROP COLUMN IF EXISTS last_zone_id;
    `);
  }
}
