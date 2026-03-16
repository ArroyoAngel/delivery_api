import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Schema completo consolidado de YaYa Eats.
 * Incluye todas las tablas con sus columnas finales.
 *
 * Roles soportados: superadmin | admin | rider | client
 * Estructura de usuarios: accounts → profiles → clients | riders | admins
 */
export class CleanSchema1742500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {

    // ── 1. accounts ───────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE accounts (
        id         UUID        NOT NULL DEFAULT gen_random_uuid(),
        email      VARCHAR     NOT NULL,
        password   VARCHAR,
        google_id  VARCHAR,
        roles      TEXT[]      NOT NULL DEFAULT '{client}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT PK_accounts       PRIMARY KEY (id),
        CONSTRAINT UQ_accounts_email UNIQUE (email)
      )
    `);

    // ── 2. profiles ───────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE profiles (
        id         UUID        NOT NULL DEFAULT gen_random_uuid(),
        account_id UUID        NOT NULL,
        first_name VARCHAR,
        last_name  VARCHAR,
        phone      VARCHAR,
        avatar_url VARCHAR,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT PK_profiles     PRIMARY KEY (id),
        CONSTRAINT UQ_profiles_acc UNIQUE (account_id),
        CONSTRAINT FK_profiles_acc FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
      )
    `);

    // ── 3. clients ────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE clients (
        id         UUID        NOT NULL DEFAULT gen_random_uuid(),
        profile_id UUID        NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT PK_clients      PRIMARY KEY (id),
        CONSTRAINT UQ_clients_prof UNIQUE (profile_id),
        CONSTRAINT FK_clients_prof FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
      )
    `);

    // ── 4. riders ─────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE riders (
        id           UUID        NOT NULL DEFAULT gen_random_uuid(),
        profile_id   UUID        NOT NULL,
        vehicle_type VARCHAR,
        is_available BOOLEAN     NOT NULL DEFAULT false,
        lat          DECIMAL(10,7),
        lng          DECIMAL(10,7),
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT PK_riders      PRIMARY KEY (id),
        CONSTRAINT UQ_riders_prof UNIQUE (profile_id),
        CONSTRAINT FK_riders_prof FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
      )
    `);

    // ── 5. roles ──────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE roles (
        id          SERIAL      NOT NULL,
        name        VARCHAR     NOT NULL,
        parent_id   INTEGER,
        profile_type VARCHAR(20),
        is_system   BOOLEAN     NOT NULL DEFAULT false,
        description VARCHAR,
        active      BOOLEAN     NOT NULL DEFAULT true,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT PK_roles      PRIMARY KEY (id),
        CONSTRAINT UQ_roles_name UNIQUE (name),
        CONSTRAINT FK_roles_parent FOREIGN KEY (parent_id) REFERENCES roles(id) ON DELETE SET NULL
      )
    `);

    // ── 6. admins ─────────────────────────────────────────────────────────
    // Creado después de roles y antes de restaurants para permitir FKs
    await queryRunner.query(`
      CREATE TABLE admins (
        id                  UUID        NOT NULL DEFAULT gen_random_uuid(),
        profile_id          UUID        NOT NULL,
        restaurant_id       UUID,
        parent_admin_id     UUID,
        granted_permissions TEXT[]      NOT NULL DEFAULT '{}',
        role_name           VARCHAR(100),
        created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT PK_admins      PRIMARY KEY (id),
        CONSTRAINT UQ_admins_prof UNIQUE (profile_id),
        CONSTRAINT FK_admins_prof FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
        CONSTRAINT FK_admins_parent FOREIGN KEY (parent_admin_id) REFERENCES admins(id) ON DELETE SET NULL
      )
    `);

    // ── 7. casbin_rule ────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS casbin_rule (
        id    SERIAL  NOT NULL,
        ptype VARCHAR,
        v0    VARCHAR,
        v1    VARCHAR,
        v2    VARCHAR,
        v3    VARCHAR,
        v4    VARCHAR,
        v5    VARCHAR,
        v6    VARCHAR,
        CONSTRAINT PK_casbin_rule PRIMARY KEY (id)
      )
    `);

    // ── 8. restaurant_categories ──────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE restaurant_categories (
        id         UUID         NOT NULL DEFAULT gen_random_uuid(),
        name       VARCHAR(100) NOT NULL,
        icon       VARCHAR(100),
        sort_order INT          NOT NULL DEFAULT 0,
        CONSTRAINT PK_restaurant_categories PRIMARY KEY (id)
      )
    `);

    // ── 9. restaurants ────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE restaurants (
        id                UUID          NOT NULL DEFAULT gen_random_uuid(),
        owner_account_id  UUID,
        name              VARCHAR(200)  NOT NULL,
        description       TEXT,
        address           TEXT          NOT NULL,
        latitude          DECIMAL(10,7),
        longitude         DECIMAL(10,7),
        category_id       UUID,
        image_url         TEXT,
        rating            DECIMAL(2,1)  NOT NULL DEFAULT 0,
        delivery_time_min INT           NOT NULL DEFAULT 30,
        delivery_fee      DECIMAL(10,2) NOT NULL DEFAULT 0,
        minimum_order     DECIMAL(10,2) NOT NULL DEFAULT 0,
        is_open           BOOLEAN       NOT NULL DEFAULT true,
        opening_time      TIME,
        closing_time      TIME,
        created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT PK_restaurants PRIMARY KEY (id),
        CONSTRAINT FK_rest_owner  FOREIGN KEY (owner_account_id) REFERENCES accounts(id) ON DELETE SET NULL,
        CONSTRAINT FK_rest_cat    FOREIGN KEY (category_id) REFERENCES restaurant_categories(id) ON DELETE SET NULL
      )
    `);

    // FK de admins → restaurants (no se pudo antes porque restaurants no existía)
    await queryRunner.query(`
      ALTER TABLE admins
        ADD CONSTRAINT FK_admins_rest FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
    `);

    // ── 10. restaurant_schedules ──────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE restaurant_schedules (
        id            UUID     NOT NULL DEFAULT gen_random_uuid(),
        restaurant_id UUID     NOT NULL,
        day_of_week   SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
        open_time     TIME,
        close_time    TIME,
        is_closed     BOOLEAN  NOT NULL DEFAULT false,
        CONSTRAINT PK_restaurant_schedules PRIMARY KEY (id),
        CONSTRAINT UQ_sched_day UNIQUE (restaurant_id, day_of_week),
        CONSTRAINT FK_sched_rest FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
      )
    `);

    // ── 11. menu_categories ───────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE menu_categories (
        id            UUID         NOT NULL DEFAULT gen_random_uuid(),
        restaurant_id UUID         NOT NULL,
        name          VARCHAR(100) NOT NULL,
        sort_order    INT          NOT NULL DEFAULT 0,
        CONSTRAINT PK_menu_categories PRIMARY KEY (id),
        CONSTRAINT FK_menucat_rest    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
      )
    `);

    // ── 12. menu_items ────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE menu_items (
        id                   UUID          NOT NULL DEFAULT gen_random_uuid(),
        restaurant_id        UUID          NOT NULL,
        category_id          UUID,
        name                 VARCHAR(200)  NOT NULL,
        description          TEXT,
        price                DECIMAL(10,2) NOT NULL,
        image_url            TEXT,
        is_available         BOOLEAN       NOT NULL DEFAULT true,
        preparation_time_min INT           NOT NULL DEFAULT 15,
        size                 INT           NOT NULL DEFAULT 1,
        stock                INTEGER,
        daily_limit          INTEGER,
        daily_sold           INTEGER       NOT NULL DEFAULT 0,
        created_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT PK_menu_items PRIMARY KEY (id),
        CONSTRAINT FK_item_rest  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
        CONSTRAINT FK_item_cat   FOREIGN KEY (category_id)   REFERENCES menu_categories(id) ON DELETE SET NULL
      )
    `);

    // ── 13. system_config ─────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE system_config (
        key         VARCHAR     NOT NULL,
        value       VARCHAR     NOT NULL,
        description VARCHAR,
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT PK_system_config PRIMARY KEY (key)
      )
    `);

    // ── 14. delivery_groups ───────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE delivery_groups (
        id         UUID        NOT NULL DEFAULT gen_random_uuid(),
        rider_id   UUID,
        status     VARCHAR(20) NOT NULL DEFAULT 'available',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT PK_delivery_groups PRIMARY KEY (id),
        CONSTRAINT FK_dg_rider        FOREIGN KEY (rider_id) REFERENCES riders(id) ON DELETE SET NULL
      )
    `);

    // ── 15. orders ────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE orders (
        id               UUID          NOT NULL DEFAULT gen_random_uuid(),
        client_id        UUID          NOT NULL,
        restaurant_id    UUID          NOT NULL,
        rider_id         UUID,
        status           VARCHAR(30)   NOT NULL DEFAULT 'pendiente',
        delivery_type    VARCHAR(20)   NOT NULL DEFAULT 'delivery',
        delivery_address TEXT,
        delivery_lat     DECIMAL(10,7),
        delivery_lng     DECIMAL(10,7),
        subtotal         DECIMAL(10,2) NOT NULL DEFAULT 0,
        total            DECIMAL(10,2) NOT NULL DEFAULT 0,
        delivery_fee     DECIMAL(10,2) NOT NULL DEFAULT 0,
        platform_fee     DECIMAL(10,2) NOT NULL DEFAULT 0,
        payment_reference VARCHAR,
        notes            TEXT,
        group_id         UUID,
        order_size       INT           NOT NULL DEFAULT 0,
        created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
        updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT PK_orders     PRIMARY KEY (id),
        CONSTRAINT FK_ord_client FOREIGN KEY (client_id)     REFERENCES accounts(id)     ON DELETE RESTRICT,
        CONSTRAINT FK_ord_rest   FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)  ON DELETE RESTRICT,
        CONSTRAINT FK_ord_rider  FOREIGN KEY (rider_id)      REFERENCES riders(id)       ON DELETE SET NULL,
        CONSTRAINT FK_ord_group  FOREIGN KEY (group_id)      REFERENCES delivery_groups(id) ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX idx_orders_payment_reference
      ON orders(payment_reference)
      WHERE payment_reference IS NOT NULL
    `);

    // ── 16. order_items ───────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE order_items (
        id           UUID          NOT NULL DEFAULT gen_random_uuid(),
        order_id     UUID          NOT NULL,
        menu_item_id UUID          NOT NULL,
        quantity     INT           NOT NULL DEFAULT 1,
        unit_price   DECIMAL(10,2) NOT NULL,
        notes        TEXT,
        CONSTRAINT PK_order_items PRIMARY KEY (id),
        CONSTRAINT FK_oi_order   FOREIGN KEY (order_id)     REFERENCES orders(id)     ON DELETE CASCADE,
        CONSTRAINT FK_oi_item    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE RESTRICT
      )
    `);

    // ── 17. user_addresses ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE user_addresses (
        id         UUID         NOT NULL DEFAULT gen_random_uuid(),
        account_id UUID         NOT NULL,
        name       VARCHAR(100) NOT NULL,
        street     VARCHAR(255) NOT NULL,
        number     VARCHAR(20),
        floor      VARCHAR(20),
        reference  TEXT,
        latitude   DECIMAL(10,7),
        longitude  DECIMAL(10,7),
        is_default BOOLEAN      NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT PK_user_addresses PRIMARY KEY (id),
        CONSTRAINT FK_addr_account   FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
      )
    `);

    // ── 18. rider_location_history ────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE rider_location_history (
        id               UUID        NOT NULL DEFAULT gen_random_uuid(),
        rider_id         UUID        NOT NULL,
        path             TEXT        NOT NULL,
        started_at       TIMESTAMPTZ NOT NULL,
        ended_at         TIMESTAMPTZ NOT NULL,
        interval_seconds INT         NOT NULL DEFAULT 5,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT PK_rider_location_history PRIMARY KEY (id),
        CONSTRAINT FK_rlh_rider FOREIGN KEY (rider_id) REFERENCES riders(id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_rlh_rider_segment ON rider_location_history (rider_id, started_at)
    `);

    // ── 19. device_tokens ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE device_tokens (
        id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id    VARCHAR     NOT NULL,
        token      TEXT        NOT NULL UNIQUE,
        platform   VARCHAR(10) NOT NULL DEFAULT 'android',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_device_tokens_user_id ON device_tokens(user_id)
    `);

    // ── 20. notifications ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE notifications (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     UUID        NOT NULL,
        title       VARCHAR     NOT NULL,
        body        VARCHAR     NOT NULL,
        type        VARCHAR,
        data        JSONB,
        is_read     BOOLEAN     NOT NULL DEFAULT FALSE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_notifications_user_id ON notifications(user_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_notifications_user_unread
      ON notifications(user_id, is_read) WHERE is_read = FALSE
    `);

    // ── 21. payments ─────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE payments (
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
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_payments_status ON payments(status)`);
    await queryRunner.query(`CREATE INDEX idx_payments_order_id ON payments(order_id)`);
    await queryRunner.query(`CREATE INDEX idx_payments_group_id ON payments(group_id)`);

    // ── 22. bank accounts ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE restaurant_bank_accounts (
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
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_restaurant_bank_accounts_restaurant_id ON restaurant_bank_accounts(restaurant_id)`);

    await queryRunner.query(`
      CREATE TABLE rider_bank_accounts (
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
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_rider_bank_accounts_rider_id ON rider_bank_accounts(rider_id)`);

    // ── 23. wallet and withdrawals ───────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE wallet_transactions (
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
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_wallet_transactions_owner ON wallet_transactions(owner_type, owner_id, status)`);

    await queryRunner.query(`
      CREATE TABLE withdrawal_requests (
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
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_withdrawal_requests_owner ON withdrawal_requests(owner_type, status)`);

    // ── 24. ratings ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE ratings (
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
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_ratings_target_account ON ratings(target_type, target_account_id)`);
    await queryRunner.query(`CREATE INDEX idx_ratings_target_restaurant ON ratings(target_type, target_restaurant_id)`);
    await queryRunner.query(`CREATE INDEX idx_ratings_order ON ratings(order_id)`);

    // ── 25. restaurant_service_areas ─────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE restaurant_service_areas (
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
      CREATE INDEX idx_rsa_restaurant_sort
      ON restaurant_service_areas (restaurant_id, sort_order)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_rsa_restaurant_sort`);
    await queryRunner.query(`DROP TABLE IF EXISTS restaurant_service_areas`);
    await queryRunner.query(`DROP TABLE IF EXISTS ratings`);
    await queryRunner.query(`DROP TABLE IF EXISTS withdrawal_requests`);
    await queryRunner.query(`DROP TABLE IF EXISTS wallet_transactions`);
    await queryRunner.query(`DROP TABLE IF EXISTS rider_bank_accounts`);
    await queryRunner.query(`DROP TABLE IF EXISTS restaurant_bank_accounts`);
    await queryRunner.query(`DROP TABLE IF EXISTS payments`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_notifications_user_unread`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_notifications_user_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS notifications`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_device_tokens_user_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS device_tokens`);
    await queryRunner.query(`DROP TABLE IF EXISTS rider_location_history`);
    await queryRunner.query(`DROP TABLE IF EXISTS user_addresses`);
    await queryRunner.query(`DROP TABLE IF EXISTS order_items`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_orders_payment_reference`);
    await queryRunner.query(`DROP TABLE IF EXISTS orders`);
    await queryRunner.query(`DROP TABLE IF EXISTS delivery_groups`);
    await queryRunner.query(`DROP TABLE IF EXISTS system_config`);
    await queryRunner.query(`DROP TABLE IF EXISTS menu_items`);
    await queryRunner.query(`DROP TABLE IF EXISTS menu_categories`);
    await queryRunner.query(`DROP TABLE IF EXISTS restaurant_schedules`);
    await queryRunner.query(`ALTER TABLE admins DROP CONSTRAINT IF EXISTS FK_admins_rest`);
    await queryRunner.query(`DROP TABLE IF EXISTS restaurants`);
    await queryRunner.query(`DROP TABLE IF EXISTS restaurant_categories`);
    await queryRunner.query(`DROP TABLE IF EXISTS casbin_rule`);
    await queryRunner.query(`DROP TABLE IF EXISTS admins`);
    await queryRunner.query(`DROP TABLE IF EXISTS roles`);
    await queryRunner.query(`DROP TABLE IF EXISTS riders`);
    await queryRunner.query(`DROP TABLE IF EXISTS clients`);
    await queryRunner.query(`DROP TABLE IF EXISTS profiles`);
    await queryRunner.query(`DROP TABLE IF EXISTS accounts`);
  }
}
