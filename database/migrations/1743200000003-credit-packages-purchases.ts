import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreditPackagesPurchases1743200000003 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE IF NOT EXISTS credit_packages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL,
        credits INT NOT NULL,
        bonus_credits INT NOT NULL DEFAULT 0,
        price DECIMAL(10,2) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await runner.query(`
      CREATE TABLE IF NOT EXISTS credit_purchases (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        rider_id UUID NOT NULL,
        package_id UUID NOT NULL REFERENCES credit_packages(id),
        credits_granted INT NOT NULL,
        amount_paid DECIMAL(10,2) NOT NULL,
        payment_reference VARCHAR(100) NOT NULL UNIQUE,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await runner.query(`
      INSERT INTO credit_packages (name, credits, bonus_credits, price) VALUES
        ('Pack Básico',   100,  0, 100.00),
        ('Pack Pro',      200, 20, 200.00),
        ('Pack Premium',  500, 75, 500.00)
      ON CONFLICT DO NOTHING;
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DROP TABLE IF EXISTS credit_purchases;`);
    await runner.query(`DROP TABLE IF EXISTS credit_packages;`);
  }
}
