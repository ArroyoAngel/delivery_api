import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrdersCancelReason1743200000039 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS cancel_reason VARCHAR(500) NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE orders DROP COLUMN IF EXISTS cancel_reason
    `);
  }
}
