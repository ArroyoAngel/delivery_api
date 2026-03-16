import { MigrationInterface, QueryRunner } from 'typeorm';

export class MarketplaceFinance1742500000008 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO system_config (key, value, description) VALUES
        ('platform_service_fee', '0.00', 'Cargo fijo de plataforma aplicado al pago total'),
        ('minimum_withdrawal_amount', '20.00', 'Monto mínimo para solicitar retiros')
      ON CONFLICT (key) DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO restaurant_bank_accounts (restaurant_id, bank_name, account_holder, account_number, account_type, branch_name, is_default)
      VALUES
        ('b1000000-0000-0000-0000-000000000001', 'BNB', 'El Fogón Cruceño SRL', '201000000001', 'corriente', 'Equipetrol', true),
        ('b1000000-0000-0000-0000-000000000002', 'BNB', 'La Casona SRL', '201000000002', 'corriente', 'Monseñor Rivero', true),
        ('b1000000-0000-0000-0000-000000000003', 'BNB', 'Sushi Zen SRL', '201000000003', 'corriente', 'Centro', true)
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO rider_bank_accounts (rider_id, bank_name, account_holder, account_number, account_type, branch_name, is_default)
      SELECT r.id, 'BNB', p.first_name || ' ' || p.last_name, data.account_number, 'ahorros', 'Santa Cruz', true
      FROM riders r
      JOIN profiles p ON p.id = r.profile_id
      JOIN (
        VALUES
          ('rider1@yayaeats.com', '301000000001'),
          ('rider2@yayaeats.com', '301000000002'),
          ('rider3@yayaeats.com', '301000000003')
      ) AS data(email, account_number)
        ON EXISTS (
          SELECT 1 FROM accounts a WHERE a.email = data.email AND a.id = p.account_id
        )
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO payments (reference, scope_type, order_id, payer_account_id, status, subtotal, delivery_fee, platform_fee, total_amount, bank_provider, confirmed_at, metadata)
      SELECT
        'ORD_' || REPLACE(o.id::text, '-', ''),
        'order',
        o.id,
        o.client_id,
        'confirmed',
        GREATEST(o.total - o.delivery_fee, 0),
        o.delivery_fee,
        0,
        o.total,
        'BNB',
        o.updated_at,
        jsonb_build_object('seeded', true)
      FROM orders o
      WHERE o.id::text LIKE 'd1000000%'
      ON CONFLICT (reference) DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO wallet_transactions (owner_type, owner_id, payment_id, order_id, entry_type, amount, status, description)
      SELECT
        'restaurant',
        o.restaurant_id,
        p.id,
        o.id,
        'credit',
        GREATEST(o.total - o.delivery_fee, 0),
        'confirmed',
        'Venta confirmada de pedido seed'
      FROM orders o
      JOIN payments p ON p.order_id = o.id
      WHERE o.id::text LIKE 'd1000000%'
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO wallet_transactions (owner_type, owner_id, payment_id, order_id, entry_type, amount, status, description)
      SELECT
        'rider',
        o.rider_id,
        p.id,
        o.id,
        'credit',
        o.delivery_fee,
        'confirmed',
        'Comisión de entrega seed'
      FROM orders o
      JOIN payments p ON p.order_id = o.id
      WHERE o.id::text LIKE 'd1000000%' AND o.rider_id IS NOT NULL
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO withdrawal_requests (owner_type, rider_id, amount, status, rider_bank_account_id, external_transfer_id, processed_at, notes)
      SELECT 'rider', r.id, 15.00, 'completed', rba.id, 'BNB-SEED-R1', NOW() - interval '1 day', 'Retiro de ejemplo de rider'
      FROM riders r
      JOIN profiles p ON p.id = r.profile_id
      JOIN accounts a ON a.id = p.account_id AND a.email = 'rider1@yayaeats.com'
      JOIN rider_bank_accounts rba ON rba.rider_id = r.id AND rba.is_default = true
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO withdrawal_requests (owner_type, restaurant_id, amount, status, restaurant_bank_account_id, notes)
      SELECT 'restaurant', r.id, 45.00, 'pending', rba.id, 'Retiro pendiente de ejemplo'
      FROM restaurants r
      JOIN restaurant_bank_accounts rba ON rba.restaurant_id = r.id AND rba.is_default = true
      WHERE r.id = 'b1000000-0000-0000-0000-000000000001'
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO ratings (order_id, rater_account_id, target_type, target_restaurant_id, score, comment)
      VALUES
        ('d1000000-0000-0000-0000-000000000001', (SELECT id FROM accounts WHERE email = 'ana.garcia@gmail.com'), 'restaurant', 'b1000000-0000-0000-0000-000000000001', 5, 'Muy buena parrilla'),
        ('d1000000-0000-0000-0000-000000000003', (SELECT id FROM accounts WHERE email = 'sofia.vargas@gmail.com'), 'restaurant', 'b1000000-0000-0000-0000-000000000003', 4, 'Sushi fresco y rápido')
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO ratings (order_id, rater_account_id, target_type, target_account_id, score, comment)
      VALUES
        ('d1000000-0000-0000-0000-000000000001', (SELECT id FROM accounts WHERE email = 'ana.garcia@gmail.com'), 'rider', (SELECT a.id FROM accounts a JOIN profiles p ON p.account_id = a.id JOIN riders r ON r.profile_id = p.id WHERE r.id = (SELECT rider_id FROM orders WHERE id = 'd1000000-0000-0000-0000-000000000001')), 5, 'Entrega muy amable'),
        ('d1000000-0000-0000-0000-000000000002', (SELECT id FROM accounts WHERE email = 'admin.casona@yayaeats.com'), 'client', (SELECT id FROM accounts WHERE email = 'carlos.mendez@gmail.com'), 4, 'Cliente puntual al recibir'),
        ('d1000000-0000-0000-0000-000000000004', (SELECT id FROM accounts WHERE email = 'rider2@yayaeats.com'), 'client', (SELECT id FROM accounts WHERE email = 'miguel.torrez@gmail.com'), 5, 'Cliente ubicado fácilmente')
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM ratings WHERE order_id::text LIKE 'd1000000%';`);
    await queryRunner.query(`DELETE FROM withdrawal_requests WHERE notes LIKE '%ejemplo%';`);
    await queryRunner.query(`DELETE FROM wallet_transactions WHERE description LIKE '%seed%';`);
    await queryRunner.query(`DELETE FROM payments WHERE reference LIKE 'ORD_D1000000%';`);
    await queryRunner.query(`DELETE FROM rider_bank_accounts;`);
    await queryRunner.query(`DELETE FROM restaurant_bank_accounts;`);
    await queryRunner.query(`DELETE FROM system_config WHERE key IN ('platform_service_fee', 'minimum_withdrawal_amount');`);
  }
}