import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemainingRestaurantConstraints1742800000004 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    // ── withdrawal_requests: owner_type 'restaurant' → 'shop' ─────────────
    await qr.query(`ALTER TABLE withdrawal_requests DROP CONSTRAINT IF EXISTS chk_withdraw_owner_type`);
    await qr.query(`ALTER TABLE withdrawal_requests DROP CONSTRAINT IF EXISTS chk_withdraw_owner_target`);

    await qr.query(`UPDATE withdrawal_requests SET owner_type = 'shop' WHERE owner_type = 'restaurant'`);

    await qr.query(`
      ALTER TABLE withdrawal_requests
        ADD CONSTRAINT chk_withdraw_owner_type
        CHECK (owner_type IN ('shop', 'rider'))
    `);
    await qr.query(`
      ALTER TABLE withdrawal_requests
        ADD CONSTRAINT chk_withdraw_owner_target
        CHECK (
          (owner_type = 'shop'  AND shop_id IS NOT NULL AND rider_id IS NULL) OR
          (owner_type = 'rider' AND rider_id IS NOT NULL AND shop_id IS NULL)
        )
    `);

    // Rename FK column restaurant_bank_account_id → shop_bank_account_id if still old name
    await qr.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'withdrawal_requests' AND column_name = 'restaurant_bank_account_id'
        ) THEN
          ALTER TABLE withdrawal_requests RENAME COLUMN restaurant_bank_account_id TO shop_bank_account_id;
        END IF;
      END $$
    `);

    // Rename the FK constraint to match new naming
    await qr.query(`ALTER TABLE withdrawal_requests DROP CONSTRAINT IF EXISTS fk_withdraw_rest_bank`);
    await qr.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'withdrawal_requests' AND column_name = 'shop_bank_account_id'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE table_name = 'withdrawal_requests' AND constraint_name = 'fk_withdraw_shop_bank'
        ) THEN
          ALTER TABLE withdrawal_requests
            ADD CONSTRAINT fk_withdraw_shop_bank
            FOREIGN KEY (shop_bank_account_id) REFERENCES shop_bank_accounts(id) ON DELETE SET NULL;
        END IF;
      END $$
    `);

    // ── ratings: target_type 'restaurant' → 'shop' ───────────────────────
    await qr.query(`ALTER TABLE ratings DROP CONSTRAINT IF EXISTS chk_ratings_target_type`);
    await qr.query(`ALTER TABLE ratings DROP CONSTRAINT IF EXISTS chk_ratings_target`);

    await qr.query(`UPDATE ratings SET target_type = 'shop' WHERE target_type = 'restaurant'`);

    await qr.query(`
      ALTER TABLE ratings
        ADD CONSTRAINT chk_ratings_target_type
        CHECK (target_type IN ('client', 'rider', 'shop'))
    `);
    await qr.query(`
      ALTER TABLE ratings
        ADD CONSTRAINT chk_ratings_target
        CHECK (
          (target_type = 'shop'  AND target_shop_id IS NOT NULL AND target_account_id IS NULL) OR
          (target_type IN ('client', 'rider') AND target_account_id IS NOT NULL)
        )
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE withdrawal_requests DROP CONSTRAINT IF EXISTS chk_withdraw_owner_type`);
    await qr.query(`ALTER TABLE withdrawal_requests DROP CONSTRAINT IF EXISTS chk_withdraw_owner_target`);
    await qr.query(`UPDATE withdrawal_requests SET owner_type = 'restaurant' WHERE owner_type = 'shop'`);
    await qr.query(`ALTER TABLE withdrawal_requests ADD CONSTRAINT chk_withdraw_owner_type CHECK (owner_type IN ('restaurant', 'rider'))`);

    await qr.query(`ALTER TABLE ratings DROP CONSTRAINT IF EXISTS chk_ratings_target_type`);
    await qr.query(`ALTER TABLE ratings DROP CONSTRAINT IF EXISTS chk_ratings_target`);
    await qr.query(`UPDATE ratings SET target_type = 'restaurant' WHERE target_type = 'shop'`);
    await qr.query(`ALTER TABLE ratings ADD CONSTRAINT chk_ratings_target_type CHECK (target_type IN ('client', 'rider', 'restaurant'))`);
  }
}
