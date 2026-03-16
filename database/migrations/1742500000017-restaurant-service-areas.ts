import { MigrationInterface, QueryRunner } from 'typeorm';

export class RestaurantServiceAreas1742500000017 implements MigrationInterface {
  name = 'RestaurantServiceAreas1742500000017';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS restaurant_service_areas (
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        restaurant_id UUID NOT NULL,
        name VARCHAR(120) NOT NULL,
        kind VARCHAR(20) NOT NULL DEFAULT 'mesa',
        color VARCHAR(20) NOT NULL DEFAULT '#f97316',
        sort_order INT NOT NULL DEFAULT 1,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT PK_restaurant_service_areas PRIMARY KEY (id),
        CONSTRAINT FK_rsa_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_rsa_restaurant_sort
      ON restaurant_service_areas (restaurant_id, sort_order)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_rsa_restaurant_sort`);
    await queryRunner.query(`DROP TABLE IF EXISTS restaurant_service_areas`);
  }
}
