import { MigrationInterface, QueryRunner } from 'typeorm';

export class MarketplaceFinanceAndRatings1742500000010 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS platform_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS payment_reference VARCHAR;
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_payment_reference
      ON orders(payment_reference)
      WHERE payment_reference IS NOT NULL;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        reference           VARCHAR NOT NULL UNIQUE,
        scope_type          VARCHAR(20) NOT NULL,
        order_id            UUID,
        group_id            UUID,
        payer_account_id    UUID NOT NULL,
        status              VARCHAR(20) NOT NULL DEFAULT 'pending',
        currency            VARCHAR(10) NOT NULL DEFAULT 'BOB',
        subtotal            DECIMAL(10,2) NOT NULL DEFAULT 0,
        delivery_fee        DECIMAL(10,2) NOT NULL DEFAULT 0,
        platform_fee        DECIMAL(10,2) NOT NULL DEFAULT 0,
        total_amount        DECIMAL(10,2) NOT NULL DEFAULT 0,
        bank_provider       VARCHAR,
        bank_transaction_id VARCHAR,
        metadata            JSONB,
        requested_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        confirmed_at        TIMESTAMPTZ,
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_payments_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
        CONSTRAINT fk_payments_group FOREIGN KEY (group_id) REFERENCES delivery_groups(id) ON DELETE SET NULL,
        CONSTRAINT fk_payments_payer FOREIGN KEY (payer_account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
        CONSTRAINT chk_payments_scope CHECK (scope_type IN ('order','group')),
        CONSTRAINT chk_payments_target CHECK (
          (scope_type = 'order' AND order_id IS NOT NULL AND group_id IS NULL)
          OR (scope_type = 'group' AND group_id IS NOT NULL AND order_id IS NULL)
        )
      );
      CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
      CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
      CREATE INDEX IF NOT EXISTS idx_payments_group_id ON payments(group_id);
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS restaurant_bank_accounts (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        restaurant_id  UUID NOT NULL,
        bank_name      VARCHAR NOT NULL,
        account_holder VARCHAR NOT NULL,
        account_number VARCHAR NOT NULL,
        account_type   VARCHAR,
        branch_name    VARCHAR,
        currency       VARCHAR(10) NOT NULL DEFAULT 'BOB',
        is_default     BOOLEAN NOT NULL DEFAULT FALSE,
        is_active      BOOLEAN NOT NULL DEFAULT TRUE,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_restaurant_bank_account_rest FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_restaurant_bank_accounts_restaurant_id ON restaurant_bank_accounts(restaurant_id);
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS rider_bank_accounts (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        rider_id       UUID NOT NULL,
        bank_name      VARCHAR NOT NULL,
        account_holder VARCHAR NOT NULL,
        account_number VARCHAR NOT NULL,
        account_type   VARCHAR,
        branch_name    VARCHAR,
        currency       VARCHAR(10) NOT NULL DEFAULT 'BOB',
        is_default     BOOLEAN NOT NULL DEFAULT FALSE,
        is_active      BOOLEAN NOT NULL DEFAULT TRUE,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_rider_bank_account_rider FOREIGN KEY (rider_id) REFERENCES riders(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_rider_bank_accounts_rider_id ON rider_bank_accounts(rider_id);
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS wallet_transactions (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_type  VARCHAR(20) NOT NULL,
        owner_id    UUID NOT NULL,
        payment_id  UUID,
        order_id    UUID,
        group_id    UUID,
        entry_type  VARCHAR(20) NOT NULL,
        amount      DECIMAL(10,2) NOT NULL,
        status      VARCHAR(20) NOT NULL DEFAULT 'pending',
        description TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_wallet_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL,
        CONSTRAINT fk_wallet_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
        CONSTRAINT fk_wallet_group FOREIGN KEY (group_id) REFERENCES delivery_groups(id) ON DELETE SET NULL,
        CONSTRAINT chk_wallet_owner_type CHECK (owner_type IN ('restaurant','rider','platform')),
        CONSTRAINT chk_wallet_entry_type CHECK (entry_type IN ('credit','debit','adjustment'))
      );
      CREATE INDEX IF NOT EXISTS idx_wallet_transactions_owner ON wallet_transactions(owner_type, owner_id, status);
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS withdrawal_requests (
        id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_type                 VARCHAR(20) NOT NULL,
        restaurant_id              UUID,
        rider_id                   UUID,
        amount                     DECIMAL(10,2) NOT NULL,
        status                     VARCHAR(20) NOT NULL DEFAULT 'pending',
        restaurant_bank_account_id UUID,
        rider_bank_account_id      UUID,
        external_transfer_id       VARCHAR,
        notes                      TEXT,
        requested_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        processed_at               TIMESTAMPTZ,
        updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_withdraw_rest FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE SET NULL,
        CONSTRAINT fk_withdraw_rider FOREIGN KEY (rider_id) REFERENCES riders(id) ON DELETE SET NULL,
        CONSTRAINT fk_withdraw_rest_bank FOREIGN KEY (restaurant_bank_account_id) REFERENCES restaurant_bank_accounts(id) ON DELETE SET NULL,
        CONSTRAINT fk_withdraw_rider_bank FOREIGN KEY (rider_bank_account_id) REFERENCES rider_bank_accounts(id) ON DELETE SET NULL,
        CONSTRAINT chk_withdraw_owner_type CHECK (owner_type IN ('restaurant','rider')),
        CONSTRAINT chk_withdraw_owner_target CHECK (
          (owner_type = 'restaurant' AND restaurant_id IS NOT NULL AND rider_id IS NULL)
          OR (owner_type = 'rider' AND rider_id IS NOT NULL AND restaurant_id IS NULL)
        )
      );
      CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_owner ON withdrawal_requests(owner_type, status);
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ratings (
        id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id             UUID,
        group_id             UUID,
        rater_account_id     UUID NOT NULL,
        target_type          VARCHAR(20) NOT NULL,
        target_account_id    UUID,
        target_restaurant_id UUID,
        score                INT NOT NULL,
        comment              TEXT,
        created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_ratings_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        CONSTRAINT fk_ratings_group FOREIGN KEY (group_id) REFERENCES delivery_groups(id) ON DELETE CASCADE,
        CONSTRAINT fk_ratings_rater FOREIGN KEY (rater_account_id) REFERENCES accounts(id) ON DELETE CASCADE,
        CONSTRAINT fk_ratings_target_account FOREIGN KEY (target_account_id) REFERENCES accounts(id) ON DELETE CASCADE,
        CONSTRAINT fk_ratings_target_restaurant FOREIGN KEY (target_restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
        CONSTRAINT chk_ratings_score CHECK (score BETWEEN 1 AND 5),
        CONSTRAINT chk_ratings_target_type CHECK (target_type IN ('client','rider','restaurant')),
        CONSTRAINT chk_ratings_target CHECK (
          (target_type = 'restaurant' AND target_restaurant_id IS NOT NULL AND target_account_id IS NULL)
          OR (target_type IN ('client','rider') AND target_account_id IS NOT NULL)
        )
      );
      CREATE INDEX IF NOT EXISTS idx_ratings_target_account ON ratings(target_type, target_account_id);
      CREATE INDEX IF NOT EXISTS idx_ratings_target_restaurant ON ratings(target_type, target_restaurant_id);
      CREATE INDEX IF NOT EXISTS idx_ratings_order ON ratings(order_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS ratings;`);
    await queryRunner.query(`DROP TABLE IF EXISTS withdrawal_requests;`);
    await queryRunner.query(`DROP TABLE IF EXISTS wallet_transactions;`);
    await queryRunner.query(`DROP TABLE IF EXISTS rider_bank_accounts;`);
    await queryRunner.query(`DROP TABLE IF EXISTS restaurant_bank_accounts;`);
    await queryRunner.query(`DROP TABLE IF EXISTS payments;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_orders_payment_reference;`);
    await queryRunner.query(`
      ALTER TABLE orders
        DROP COLUMN IF EXISTS payment_reference,
        DROP COLUMN IF EXISTS platform_fee,
        DROP COLUMN IF EXISTS subtotal;
    `);
  }
}