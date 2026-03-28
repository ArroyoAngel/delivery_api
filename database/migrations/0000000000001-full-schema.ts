import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Schema completo de YaYa Eats — versión consolidada.
 * Reemplaza las 29 migraciones anteriores.
 *
 * Para un reset limpio:
 *   npm run schema:drop
 *   npm run migrations:run
 *   npm run seeds:run
 */
export class FullSchema0000000000001 implements MigrationInterface {
  name = 'FullSchema0000000000001';

  public async up(qr: QueryRunner): Promise<void> {

    // ── CATÁLOGOS / TABLAS SIN DEPENDENCIAS ─────────────────────────────

    await qr.query(`
      CREATE TABLE accounts (
        id        UUID        NOT NULL DEFAULT gen_random_uuid(),
        email     VARCHAR     NOT NULL,
        password  VARCHAR,
        google_id VARCHAR,
        roles     TEXT[]      NOT NULL DEFAULT '{client}',
        phone_id  VARCHAR     UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT PK_accounts       PRIMARY KEY (id),
        CONSTRAINT UQ_accounts_email UNIQUE (email)
      )
    `);

    await qr.query(`
      CREATE TABLE roles (
        id           SERIAL      NOT NULL,
        name         VARCHAR     NOT NULL,
        parent_id    INTEGER,
        profile_type VARCHAR(20),
        is_system    BOOLEAN     NOT NULL DEFAULT false,
        description  VARCHAR,
        active       BOOLEAN     NOT NULL DEFAULT true,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT PK_roles      PRIMARY KEY (id),
        CONSTRAINT UQ_roles_name UNIQUE (name),
        CONSTRAINT FK_roles_parent FOREIGN KEY (parent_id)
          REFERENCES roles(id) ON DELETE SET NULL
      )
    `);

    await qr.query(`
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

    await qr.query(`
      CREATE TABLE shop_categories (
        id            UUID         NOT NULL DEFAULT gen_random_uuid(),
        name          VARCHAR(100) NOT NULL,
        icon          VARCHAR(100),
        sort_order    INT          NOT NULL DEFAULT 0,
        business_type VARCHAR(50)  NOT NULL DEFAULT 'restaurant',
        CONSTRAINT PK_shop_categories PRIMARY KEY (id)
      )
    `);

    await qr.query(`
      CREATE TABLE delivery_zones (
        id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        name           VARCHAR(100)  NOT NULL,
        city           VARCHAR(100)  NOT NULL,
        center_lat     DECIMAL(10,7) NOT NULL,
        center_lng     DECIMAL(10,7) NOT NULL,
        radius_meters  INT           NOT NULL DEFAULT 5000,
        is_active      BOOLEAN       NOT NULL DEFAULT true,
        created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      )
    `);

    await qr.query(`
      CREATE TABLE system_config (
        key         VARCHAR     NOT NULL,
        value       VARCHAR     NOT NULL,
        description VARCHAR,
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT PK_system_config PRIMARY KEY (key)
      )
    `);

    await qr.query(`
      CREATE TABLE business_types (
        value            VARCHAR PRIMARY KEY,
        label            VARCHAR NOT NULL,
        sort_order       INTEGER NOT NULL DEFAULT 0,
        service_category VARCHAR NOT NULL DEFAULT 'food',
        flutter_icon     VARCHAR,
        bg_color         VARCHAR,
        icon_color       VARCHAR,
        web_icon         VARCHAR
      )
    `);

    // ── PERFILES Y USUARIOS ────────────────────────────────────────────────

    await qr.query(`
      CREATE TABLE profiles (
        id           UUID        NOT NULL DEFAULT gen_random_uuid(),
        account_id   UUID        NOT NULL,
        first_name   VARCHAR,
        last_name    VARCHAR,
        phone        VARCHAR,
        avatar_url   VARCHAR,
        last_zone_id UUID,
        ai_profile   JSONB       NOT NULL DEFAULT '{}',
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT PK_profiles     PRIMARY KEY (id),
        CONSTRAINT UQ_profiles_acc UNIQUE (account_id),
        CONSTRAINT FK_profiles_acc FOREIGN KEY (account_id)
          REFERENCES accounts(id) ON DELETE CASCADE,
        CONSTRAINT FK_profiles_zone FOREIGN KEY (last_zone_id)
          REFERENCES delivery_zones(id) ON DELETE SET NULL
      )
    `);

    await qr.query(`
      CREATE TABLE clients (
        id         UUID        NOT NULL DEFAULT gen_random_uuid(),
        profile_id UUID        NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT PK_clients      PRIMARY KEY (id),
        CONSTRAINT UQ_clients_prof UNIQUE (profile_id),
        CONSTRAINT FK_clients_prof FOREIGN KEY (profile_id)
          REFERENCES profiles(id) ON DELETE CASCADE
      )
    `);

    await qr.query(`
      CREATE TABLE riders (
        id                UUID         NOT NULL DEFAULT gen_random_uuid(),
        profile_id        UUID         NOT NULL,
        vehicle_type      VARCHAR,
        is_available      BOOLEAN      NOT NULL DEFAULT false,
        lat               DECIMAL(10,7),
        lng               DECIMAL(10,7),
        zone_id           UUID,
        license_front_url VARCHAR,
        license_back_url  VARCHAR,
        plate             VARCHAR,
        policy_url        VARCHAR,
        vin               VARCHAR,
        created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT PK_riders       PRIMARY KEY (id),
        CONSTRAINT UQ_riders_prof  UNIQUE (profile_id),
        CONSTRAINT FK_riders_prof  FOREIGN KEY (profile_id)
          REFERENCES profiles(id) ON DELETE CASCADE,
        CONSTRAINT FK_rider_zone   FOREIGN KEY (zone_id)
          REFERENCES delivery_zones(id) ON DELETE SET NULL
      )
    `);
    await qr.query(`CREATE INDEX idx_riders_zone ON riders(zone_id)`);

    // ── NEGOCIOS ───────────────────────────────────────────────────────────

    await qr.query(`
      CREATE TABLE shops (
        id               UUID          NOT NULL DEFAULT gen_random_uuid(),
        owner_account_id UUID,
        name             VARCHAR(200)  NOT NULL,
        description      TEXT,
        address          TEXT          NOT NULL,
        latitude         DECIMAL(10,7),
        longitude        DECIMAL(10,7),
        category_id      UUID,
        image_url        TEXT,
        rating           DECIMAL(2,1)  NOT NULL DEFAULT 0,
        delivery_time_min INT          NOT NULL DEFAULT 30,
        delivery_fee     DECIMAL(10,2) NOT NULL DEFAULT 0,
        minimum_order    DECIMAL(10,2) NOT NULL DEFAULT 0,
        is_open          BOOLEAN       NOT NULL DEFAULT true,
        opening_time     TIME,
        closing_time     TIME,
        business_type    VARCHAR(50)   NOT NULL DEFAULT 'restaurant',
        zone_id          UUID,
        status           VARCHAR(20)   NOT NULL DEFAULT 'active',
        qr_image_url     TEXT,
        created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT PK_shops      PRIMARY KEY (id),
        CONSTRAINT FK_shop_owner FOREIGN KEY (owner_account_id)
          REFERENCES accounts(id) ON DELETE SET NULL,
        CONSTRAINT FK_shop_cat   FOREIGN KEY (category_id)
          REFERENCES shop_categories(id) ON DELETE SET NULL,
        CONSTRAINT FK_shop_zone  FOREIGN KEY (zone_id)
          REFERENCES delivery_zones(id) ON DELETE SET NULL
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_shops_zone ON shops(zone_id)`);

    await qr.query(`
      CREATE TABLE admins (
        id                  UUID        NOT NULL DEFAULT gen_random_uuid(),
        profile_id          UUID        NOT NULL,
        shop_id             UUID,
        parent_admin_id     UUID,
        granted_permissions TEXT[]      NOT NULL DEFAULT '{}',
        role_name           VARCHAR(100),
        started_at          DATE,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT PK_admins       PRIMARY KEY (id),
        CONSTRAINT UQ_admins_prof  UNIQUE (profile_id),
        CONSTRAINT FK_admins_prof  FOREIGN KEY (profile_id)
          REFERENCES profiles(id) ON DELETE CASCADE,
        CONSTRAINT FK_admins_shop  FOREIGN KEY (shop_id)
          REFERENCES shops(id) ON DELETE CASCADE,
        CONSTRAINT FK_admins_parent FOREIGN KEY (parent_admin_id)
          REFERENCES admins(id) ON DELETE SET NULL
      )
    `);

    await qr.query(`
      CREATE TABLE shop_schedules (
        id          UUID     NOT NULL DEFAULT gen_random_uuid(),
        shop_id     UUID     NOT NULL,
        day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
        open_time   TIME,
        close_time  TIME,
        is_closed   BOOLEAN  NOT NULL DEFAULT false,
        CONSTRAINT PK_shop_schedules PRIMARY KEY (id),
        CONSTRAINT UQ_sched_day  UNIQUE (shop_id, day_of_week),
        CONSTRAINT FK_sched_shop FOREIGN KEY (shop_id)
          REFERENCES shops(id) ON DELETE CASCADE
      )
    `);

    await qr.query(`
      CREATE TABLE menu_categories (
        id         UUID         NOT NULL DEFAULT gen_random_uuid(),
        shop_id    UUID         NOT NULL,
        name       VARCHAR(100) NOT NULL,
        sort_order INT          NOT NULL DEFAULT 0,
        CONSTRAINT PK_menu_categories PRIMARY KEY (id),
        CONSTRAINT FK_menucat_shop    FOREIGN KEY (shop_id)
          REFERENCES shops(id) ON DELETE CASCADE
      )
    `);

    await qr.query(`
      CREATE TABLE menu_items (
        id                   UUID          NOT NULL DEFAULT gen_random_uuid(),
        shop_id              UUID          NOT NULL,
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
        CONSTRAINT FK_item_shop  FOREIGN KEY (shop_id)
          REFERENCES shops(id) ON DELETE CASCADE,
        CONSTRAINT FK_item_cat   FOREIGN KEY (category_id)
          REFERENCES menu_categories(id) ON DELETE SET NULL
      )
    `);

    await qr.query(`
      CREATE TABLE shop_service_areas (
        id         UUID         NOT NULL DEFAULT gen_random_uuid(),
        shop_id    UUID         NOT NULL,
        name       VARCHAR(120) NOT NULL,
        kind       VARCHAR(20)  NOT NULL DEFAULT 'mesa',
        color      VARCHAR(20)  NOT NULL DEFAULT '#f97316',
        sort_order INT          NOT NULL DEFAULT 1,
        is_active  BOOLEAN      NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT PK_shop_service_areas PRIMARY KEY (id),
        CONSTRAINT FK_ssa_shop FOREIGN KEY (shop_id)
          REFERENCES shops(id) ON DELETE CASCADE
      )
    `);
    await qr.query(`
      CREATE INDEX idx_ssa_shop_sort ON shop_service_areas (shop_id, sort_order)
    `);

    await qr.query(`
      CREATE TABLE area_kind_options (
        value      VARCHAR(40)  PRIMARY KEY,
        label      VARCHAR(80)  NOT NULL,
        web_icon   VARCHAR(50),
        color      VARCHAR(20),
        sort_order INTEGER      NOT NULL DEFAULT 0,
        type       VARCHAR(20)  NOT NULL DEFAULT 'zona',
        shop_id    UUID REFERENCES shops(id) ON DELETE CASCADE
      )
    `);

    // ── DELIVERY ───────────────────────────────────────────────────────────

    await qr.query(`
      CREATE TABLE delivery_groups (
        id         UUID        NOT NULL DEFAULT gen_random_uuid(),
        rider_id   UUID,
        status     VARCHAR(20) NOT NULL DEFAULT 'available',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT PK_delivery_groups PRIMARY KEY (id),
        CONSTRAINT FK_dg_rider FOREIGN KEY (rider_id)
          REFERENCES riders(id) ON DELETE SET NULL
      )
    `);

    await qr.query(`
      CREATE TABLE coupons (
        id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        code             VARCHAR(50)   NOT NULL UNIQUE,
        description      VARCHAR(255),
        type             VARCHAR(20)   NOT NULL,
        value            DECIMAL(10,2) NOT NULL DEFAULT 0,
        absorbs_cost     VARCHAR(10)   NOT NULL DEFAULT 'platform',
        min_order_amount DECIMAL(10,2),
        max_uses         INT,
        uses_count       INT           NOT NULL DEFAULT 0,
        is_active        BOOLEAN       NOT NULL DEFAULT true,
        expires_at       TIMESTAMP,
        shop_id          UUID REFERENCES shops(id) ON DELETE SET NULL,
        created_by       UUID REFERENCES accounts(id) ON DELETE SET NULL,
        created_at       TIMESTAMP     NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMP     NOT NULL DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code)`);

    await qr.query(`
      CREATE TABLE orders (
        id                UUID          NOT NULL DEFAULT gen_random_uuid(),
        client_id         UUID          NOT NULL,
        shop_id           UUID          NOT NULL,
        rider_id          UUID,
        status            VARCHAR(30)   NOT NULL DEFAULT 'pendiente',
        delivery_type     VARCHAR(20)   NOT NULL DEFAULT 'delivery',
        delivery_address  TEXT,
        delivery_lat      DECIMAL(10,7),
        delivery_lng      DECIMAL(10,7),
        subtotal          DECIMAL(10,2) NOT NULL DEFAULT 0,
        total             DECIMAL(10,2) NOT NULL DEFAULT 0,
        delivery_fee      DECIMAL(10,2) NOT NULL DEFAULT 0,
        platform_fee      DECIMAL(10,2) NOT NULL DEFAULT 0,
        commission_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
        payment_reference VARCHAR,
        payment_method    VARCHAR(10)   NOT NULL DEFAULT 'qr',
        notes             TEXT,
        rider_instructions TEXT,
        coupon_code       VARCHAR(50),
        coupon_discount   DECIMAL(10,2) NOT NULL DEFAULT 0,
        coupon_absorbs    VARCHAR(10),
        cancel_reason     VARCHAR(500),
        group_id          UUID,
        order_size        INT           NOT NULL DEFAULT 0,
        created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
        updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT PK_orders     PRIMARY KEY (id),
        CONSTRAINT FK_ord_client FOREIGN KEY (client_id)
          REFERENCES accounts(id) ON DELETE RESTRICT,
        CONSTRAINT FK_ord_shop   FOREIGN KEY (shop_id)
          REFERENCES shops(id) ON DELETE RESTRICT,
        CONSTRAINT FK_ord_rider  FOREIGN KEY (rider_id)
          REFERENCES riders(id) ON DELETE SET NULL,
        CONSTRAINT FK_ord_group  FOREIGN KEY (group_id)
          REFERENCES delivery_groups(id) ON DELETE SET NULL
      )
    `);
    await qr.query(`
      CREATE UNIQUE INDEX idx_orders_payment_reference
      ON orders(payment_reference) WHERE payment_reference IS NOT NULL
    `);

    await qr.query(`
      CREATE TABLE order_items (
        id           UUID          NOT NULL DEFAULT gen_random_uuid(),
        order_id     UUID          NOT NULL,
        menu_item_id UUID          NOT NULL,
        quantity     INT           NOT NULL DEFAULT 1,
        unit_price   DECIMAL(10,2) NOT NULL,
        notes        TEXT,
        CONSTRAINT PK_order_items PRIMARY KEY (id),
        CONSTRAINT FK_oi_order FOREIGN KEY (order_id)
          REFERENCES orders(id) ON DELETE CASCADE,
        CONSTRAINT FK_oi_item  FOREIGN KEY (menu_item_id)
          REFERENCES menu_items(id) ON DELETE RESTRICT
      )
    `);

    // ── PAGOS Y FINANZAS ──────────────────────────────────────────────────

    await qr.query(`
      CREATE TABLE payments (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        reference           VARCHAR     NOT NULL UNIQUE,
        scope_type          VARCHAR(20) NOT NULL,
        order_id            UUID,
        group_id            UUID,
        payer_account_id    UUID        NOT NULL,
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
        CONSTRAINT fk_payments_order FOREIGN KEY (order_id)
          REFERENCES orders(id) ON DELETE SET NULL,
        CONSTRAINT fk_payments_group FOREIGN KEY (group_id)
          REFERENCES delivery_groups(id) ON DELETE SET NULL,
        CONSTRAINT fk_payments_payer FOREIGN KEY (payer_account_id)
          REFERENCES accounts(id) ON DELETE RESTRICT,
        CONSTRAINT chk_payments_scope CHECK (scope_type IN ('order','group')),
        CONSTRAINT chk_payments_target CHECK (
          (scope_type = 'order' AND order_id IS NOT NULL AND group_id IS NULL)
          OR (scope_type = 'group' AND group_id IS NOT NULL AND order_id IS NULL)
        )
      )
    `);
    await qr.query(`CREATE INDEX idx_payments_status   ON payments(status)`);
    await qr.query(`CREATE INDEX idx_payments_order_id ON payments(order_id)`);
    await qr.query(`CREATE INDEX idx_payments_group_id ON payments(group_id)`);

    await qr.query(`
      CREATE TABLE shop_bank_accounts (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        shop_id        UUID        NOT NULL,
        bank_name      VARCHAR     NOT NULL,
        account_holder VARCHAR     NOT NULL,
        account_number VARCHAR     NOT NULL,
        account_type   VARCHAR,
        branch_name    VARCHAR,
        currency       VARCHAR(10) NOT NULL DEFAULT 'BOB',
        is_default     BOOLEAN     NOT NULL DEFAULT FALSE,
        is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_shop_bank_account_shop FOREIGN KEY (shop_id)
          REFERENCES shops(id) ON DELETE CASCADE
      )
    `);
    await qr.query(`
      CREATE INDEX idx_shop_bank_accounts_shop_id ON shop_bank_accounts(shop_id)
    `);

    await qr.query(`
      CREATE TABLE rider_bank_accounts (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        rider_id       UUID        NOT NULL,
        bank_name      VARCHAR     NOT NULL,
        account_holder VARCHAR     NOT NULL,
        account_number VARCHAR     NOT NULL,
        account_type   VARCHAR,
        branch_name    VARCHAR,
        currency       VARCHAR(10) NOT NULL DEFAULT 'BOB',
        is_default     BOOLEAN     NOT NULL DEFAULT FALSE,
        is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_rider_bank_account_rider FOREIGN KEY (rider_id)
          REFERENCES riders(id) ON DELETE CASCADE
      )
    `);
    await qr.query(`
      CREATE INDEX idx_rider_bank_accounts_rider_id ON rider_bank_accounts(rider_id)
    `);

    await qr.query(`
      CREATE TABLE wallet_transactions (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_type VARCHAR(20)   NOT NULL,
        owner_id   UUID          NOT NULL,
        payment_id UUID,
        order_id   UUID,
        group_id   UUID,
        entry_type VARCHAR(20)   NOT NULL,
        amount     DECIMAL(10,2) NOT NULL,
        status     VARCHAR(20)   NOT NULL DEFAULT 'pending',
        description TEXT,
        created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_wallet_payment FOREIGN KEY (payment_id)
          REFERENCES payments(id) ON DELETE SET NULL,
        CONSTRAINT fk_wallet_order   FOREIGN KEY (order_id)
          REFERENCES orders(id) ON DELETE SET NULL,
        CONSTRAINT fk_wallet_group   FOREIGN KEY (group_id)
          REFERENCES delivery_groups(id) ON DELETE SET NULL,
        CONSTRAINT chk_wallet_owner_type CHECK (owner_type IN ('shop','rider','platform')),
        CONSTRAINT chk_wallet_entry_type CHECK (entry_type IN ('credit','debit','adjustment'))
      )
    `);
    await qr.query(`
      CREATE INDEX idx_wallet_transactions_owner
      ON wallet_transactions(owner_type, owner_id, status)
    `);

    await qr.query(`
      CREATE TABLE withdrawal_requests (
        id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_type            VARCHAR(20)   NOT NULL,
        shop_id               UUID,
        rider_id              UUID,
        amount                DECIMAL(10,2) NOT NULL,
        status                VARCHAR(20)   NOT NULL DEFAULT 'pending',
        shop_bank_account_id  UUID,
        rider_bank_account_id UUID,
        external_transfer_id  VARCHAR,
        notes                 TEXT,
        requested_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        processed_at          TIMESTAMPTZ,
        updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_withdraw_shop       FOREIGN KEY (shop_id)
          REFERENCES shops(id) ON DELETE SET NULL,
        CONSTRAINT fk_withdraw_rider      FOREIGN KEY (rider_id)
          REFERENCES riders(id) ON DELETE SET NULL,
        CONSTRAINT fk_withdraw_shop_bank  FOREIGN KEY (shop_bank_account_id)
          REFERENCES shop_bank_accounts(id) ON DELETE SET NULL,
        CONSTRAINT fk_withdraw_rider_bank FOREIGN KEY (rider_bank_account_id)
          REFERENCES rider_bank_accounts(id) ON DELETE SET NULL,
        CONSTRAINT chk_withdraw_owner_type CHECK (owner_type IN ('shop','rider')),
        CONSTRAINT chk_withdraw_owner_target CHECK (
          (owner_type = 'shop'  AND shop_id  IS NOT NULL AND rider_id IS NULL)
          OR (owner_type = 'rider' AND rider_id IS NOT NULL AND shop_id  IS NULL)
        )
      )
    `);
    await qr.query(`
      CREATE INDEX idx_withdrawal_requests_owner ON withdrawal_requests(owner_type, status)
    `);

    await qr.query(`
      CREATE TABLE ratings (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id          UUID,
        group_id          UUID,
        rater_account_id  UUID        NOT NULL,
        target_type       VARCHAR(20) NOT NULL,
        target_account_id UUID,
        target_shop_id    UUID,
        score             INT         NOT NULL,
        comment           TEXT,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_ratings_order          FOREIGN KEY (order_id)
          REFERENCES orders(id) ON DELETE CASCADE,
        CONSTRAINT fk_ratings_group          FOREIGN KEY (group_id)
          REFERENCES delivery_groups(id) ON DELETE CASCADE,
        CONSTRAINT fk_ratings_rater          FOREIGN KEY (rater_account_id)
          REFERENCES accounts(id) ON DELETE CASCADE,
        CONSTRAINT fk_ratings_target_account FOREIGN KEY (target_account_id)
          REFERENCES accounts(id) ON DELETE CASCADE,
        CONSTRAINT fk_ratings_target_shop    FOREIGN KEY (target_shop_id)
          REFERENCES shops(id) ON DELETE CASCADE,
        CONSTRAINT chk_ratings_score       CHECK (score BETWEEN 1 AND 5),
        CONSTRAINT chk_ratings_target_type CHECK (target_type IN ('client','rider','shop')),
        CONSTRAINT chk_ratings_target      CHECK (
          (target_type = 'shop' AND target_shop_id IS NOT NULL AND target_account_id IS NULL)
          OR (target_type IN ('client','rider') AND target_account_id IS NOT NULL)
        )
      )
    `);
    await qr.query(`
      CREATE INDEX idx_ratings_target_account ON ratings(target_type, target_account_id)
    `);
    await qr.query(`
      CREATE INDEX idx_ratings_target_shop ON ratings(target_type, target_shop_id)
    `);
    await qr.query(`CREATE INDEX idx_ratings_order ON ratings(order_id)`);

    // ── CRÉDITOS RIDER ────────────────────────────────────────────────────

    await qr.query(`
      CREATE TABLE rider_credits (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        rider_id   UUID NOT NULL UNIQUE,
        balance    INT  NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await qr.query(`
      CREATE TABLE credit_packages (
        id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        name          VARCHAR(100)  NOT NULL,
        credits       INT           NOT NULL,
        bonus_credits INT           NOT NULL DEFAULT 0,
        price         DECIMAL(10,2) NOT NULL,
        is_active     BOOLEAN       NOT NULL DEFAULT true,
        sort_order    INT           NOT NULL DEFAULT 0,
        qr_data       TEXT,
        created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      )
    `);

    await qr.query(`
      CREATE TABLE credit_purchases (
        id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        rider_id         UUID          NOT NULL,
        package_id       UUID          NOT NULL REFERENCES credit_packages(id),
        credits_granted  INT           NOT NULL,
        amount_paid      DECIMAL(10,2) NOT NULL,
        payment_reference VARCHAR(100) NOT NULL UNIQUE,
        status           VARCHAR(20)   NOT NULL DEFAULT 'pending',
        bnb_qr_id        VARCHAR(128),
        bnb_qr_image     TEXT,
        cancelled_at     TIMESTAMPTZ,
        proof_image_url  TEXT,
        rejection_reason TEXT,
        created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      )
    `);

    // ── MISCELÁNEA ────────────────────────────────────────────────────────

    await qr.query(`
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
        CONSTRAINT FK_addr_account   FOREIGN KEY (account_id)
          REFERENCES accounts(id) ON DELETE CASCADE
      )
    `);

    await qr.query(`
      CREATE TABLE rider_location_history (
        id               UUID        NOT NULL DEFAULT gen_random_uuid(),
        rider_id         UUID        NOT NULL,
        path             TEXT        NOT NULL,
        started_at       TIMESTAMPTZ NOT NULL,
        ended_at         TIMESTAMPTZ NOT NULL,
        interval_seconds INT         NOT NULL DEFAULT 5,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT PK_rider_location_history PRIMARY KEY (id),
        CONSTRAINT FK_rlh_rider FOREIGN KEY (rider_id)
          REFERENCES riders(id) ON DELETE CASCADE
      )
    `);
    await qr.query(`
      CREATE INDEX idx_rlh_rider_segment ON rider_location_history (rider_id, started_at)
    `);

    await qr.query(`
      CREATE TABLE device_tokens (
        id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id    VARCHAR     NOT NULL,
        token      TEXT        NOT NULL UNIQUE,
        platform   VARCHAR(10) NOT NULL DEFAULT 'android',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE INDEX idx_device_tokens_user_id ON device_tokens(user_id)`);

    await qr.query(`
      CREATE TABLE notifications (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id    UUID        NOT NULL,
        title      VARCHAR     NOT NULL,
        body       VARCHAR     NOT NULL,
        type       VARCHAR,
        data       JSONB,
        is_read    BOOLEAN     NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE INDEX idx_notifications_user_id ON notifications(user_id)`);
    await qr.query(`
      CREATE INDEX idx_notifications_user_unread
      ON notifications(user_id, is_read) WHERE is_read = FALSE
    `);

    await qr.query(`
      CREATE TABLE IF NOT EXISTS email_otps (
        id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        email      VARCHAR     NOT NULL,
        code       VARCHAR(6)  NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        used       BOOLEAN     NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_email_otps_email ON email_otps (email)
    `);

    await qr.query(`
      CREATE TABLE IF NOT EXISTS telegram_sessions (
        chat_id    bigint PRIMARY KEY,
        account_id uuid REFERENCES accounts(id) ON DELETE CASCADE,
        messages   jsonb NOT NULL DEFAULT '[]',
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await qr.query(`
      CREATE TABLE IF NOT EXISTS support_tickets (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        account_id  UUID REFERENCES accounts(id) ON DELETE SET NULL,
        subject     VARCHAR(255) NOT NULL,
        message     TEXT         NOT NULL,
        status      VARCHAR(20)  NOT NULL DEFAULT 'open',
        admin_notes TEXT,
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_support_tickets_account ON support_tickets(account_id)
    `);
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status)
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    // Reverse dependency order
    const tables = [
      'credit_purchases', 'credit_packages', 'rider_credits',
      'support_tickets', 'telegram_sessions', 'email_otps',
      'notifications', 'device_tokens',
      'rider_location_history', 'user_addresses',
      'ratings', 'withdrawal_requests', 'wallet_transactions',
      'rider_bank_accounts', 'shop_bank_accounts',
      'payments',
      'order_items', 'orders', 'coupons', 'delivery_groups',
      'area_kind_options', 'shop_service_areas',
      'menu_items', 'menu_categories',
      'shop_schedules', 'admins',
      'shops',
      'riders', 'clients', 'profiles',
      'accounts', 'roles', 'casbin_rule',
      'shop_categories', 'delivery_zones',
      'system_config', 'business_types',
    ];
    for (const t of tables) {
      await qr.query(`DROP TABLE IF EXISTS ${t} CASCADE`);
    }
  }
}
