import { MigrationInterface, QueryRunner } from 'typeorm';

export class WalletOwnerTypeShop1742800000003 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    // Drop old constraint that only allowed 'restaurant'
    await qr.query(`
      ALTER TABLE wallet_transactions
        DROP CONSTRAINT IF EXISTS chk_wallet_owner_type
    `);
    // Re-create with 'shop' instead of 'restaurant'
    await qr.query(`
      ALTER TABLE wallet_transactions
        ADD CONSTRAINT chk_wallet_owner_type
        CHECK (owner_type IN ('shop', 'rider', 'platform'))
    `);
    // Update any existing rows that still say 'restaurant'
    await qr.query(`
      UPDATE wallet_transactions SET owner_type = 'shop' WHERE owner_type = 'restaurant'
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
