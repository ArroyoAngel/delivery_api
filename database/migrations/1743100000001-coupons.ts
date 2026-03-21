import { MigrationInterface, QueryRunner } from 'typeorm';

export class Coupons1743100000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Tabla de cupones ─────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS coupons (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code          VARCHAR(50)  NOT NULL UNIQUE,
        description   VARCHAR(255),
        type          VARCHAR(20)  NOT NULL,
        value         DECIMAL(10,2) NOT NULL DEFAULT 0,
        absorbs_cost  VARCHAR(10)  NOT NULL DEFAULT 'platform',
        min_order_amount DECIMAL(10,2),
        max_uses      INT,
        uses_count    INT          NOT NULL DEFAULT 0,
        is_active     BOOLEAN      NOT NULL DEFAULT true,
        expires_at    TIMESTAMP,
        shop_id       UUID         REFERENCES shops(id) ON DELETE SET NULL,
        created_by    UUID         REFERENCES accounts(id) ON DELETE SET NULL,
        created_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMP    NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);
    `);

    // ── Columnas en orders ───────────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS coupon_code     VARCHAR(50),
        ADD COLUMN IF NOT EXISTS coupon_discount DECIMAL(10,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS coupon_absorbs  VARCHAR(10)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE orders
        DROP COLUMN IF EXISTS coupon_code,
        DROP COLUMN IF EXISTS coupon_discount,
        DROP COLUMN IF EXISTS coupon_absorbs
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS coupons`);
  }
}
