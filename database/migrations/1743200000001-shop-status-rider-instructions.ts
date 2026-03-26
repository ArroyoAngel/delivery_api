import { MigrationInterface, QueryRunner } from 'typeorm';

export class ShopStatusRiderInstructions1743200000001
  implements MigrationInterface
{
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE shops
      ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active';
    `);

    await runner.query(`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS rider_instructions TEXT;
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE orders DROP COLUMN IF EXISTS rider_instructions;`);
    await runner.query(`ALTER TABLE shops DROP COLUMN IF EXISTS status;`);
  }
}
