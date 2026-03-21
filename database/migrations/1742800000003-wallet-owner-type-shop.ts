import { MigrationInterface, QueryRunner } from 'typeorm';

export class WalletOwnerTypeShop1742800000003 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    // Drop old constraint
    await qr.query(`
      ALTER TABLE wallet_transactions
        DROP CONSTRAINT IF EXISTS chk_wallet_owner_type
    `);
    // Migrate existing data before adding the new constraint
    await qr.query(`
      UPDATE wallet_transactions SET owner_type = 'shop' WHERE owner_type = 'restaurant'
    `);
    // Re-create constraint with 'shop' instead of 'restaurant'
    await qr.query(`
      ALTER TABLE wallet_transactions
        ADD CONSTRAINT chk_wallet_owner_type
        CHECK (owner_type IN ('shop', 'rider', 'platform'))
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE wallet_transactions
        DROP CONSTRAINT IF EXISTS chk_wallet_owner_type
    `);
    await qr.query(`
      ALTER TABLE wallet_transactions
        ADD CONSTRAINT chk_wallet_owner_type
        CHECK (owner_type IN ('restaurant', 'rider', 'platform'))
    `);
    await qr.query(`
      UPDATE wallet_transactions SET owner_type = 'restaurant' WHERE owner_type = 'shop'
    `);
  }
}
