import { MigrationInterface, QueryRunner } from 'typeorm';

export class RiderCreditsPaymentMethod1743200000002
  implements MigrationInterface
{
  async up(runner: QueryRunner): Promise<void> {
    // Tabla de créditos por rider
    await runner.query(`
      CREATE TABLE IF NOT EXISTS rider_credits (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        rider_id UUID NOT NULL UNIQUE,
        balance INT NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Método de pago en órdenes (qr por defecto para órdenes existentes)
    await runner.query(`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS payment_method VARCHAR(10) NOT NULL DEFAULT 'qr';
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE orders DROP COLUMN IF EXISTS payment_method;`);
    await runner.query(`DROP TABLE IF EXISTS rider_credits;`);
  }
}
