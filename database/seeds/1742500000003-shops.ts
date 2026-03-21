import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Restaurantes iniciales de YaYa Eats — Santa Cruz de la Sierra, Bolivia.
 * Coordenadas alrededor de Plaza 24 de Septiembre.
 */
export class Shops1742500000003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {

    // ── categorías ────────────────────────────────────────────────────────
    await queryRunner.query(`
      INSERT INTO shop_categories (id, name, icon, sort_order, business_type) VALUES
        ('a1000000-0000-0000-0000-000000000001', 'Parrilla',    '🥩', 1, 'restaurant'),
        ('a1000000-0000-0000-0000-000000000002', 'Criolla',     '🍲', 2, 'restaurant'),
        ('a1000000-0000-0000-0000-000000000003', 'Sushi',       '🍣', 3, 'restaurant'),
        ('a1000000-0000-0000-0000-000000000004', 'Hamburguesas','🍔', 4, 'restaurant'),
        ('a1000000-0000-0000-0000-000000000005', 'Pizza',       '🍕', 5, 'restaurant'),
        ('a1000000-0000-0000-0000-000000000006', 'Pollo',       '🍗', 6, 'restaurant')
      ON CONFLICT (id) DO NOTHING
    `);

    // ── restaurantes ──────────────────────────────────────────────────────
    const restaurants = [
      {
        id:        'b1000000-0000-0000-0000-000000000001',
        owner:     'admin.fogon@yayaeats.com',
        name:      'El Fogón Cruceño',
        desc:      'Auténtica parrilla cruceña con los mejores cortes de la región.',
        address:   'Calle Libertad #123, Santa Cruz',
        lat:       -17.7840, lng: -63.1800,
        cat:       'a1000000-0000-0000-0000-000000000001',
        fee:       8.00, time: 35,
      },
      {
        id:        'b1000000-0000-0000-0000-000000000002',
        owner:     'admin.casona@yayaeats.com',
        name:      'La Casona',
        desc:      'Cocina criolla boliviana tradicional con sabores caseros.',
        address:   'Av. Monseñor Rivero #456, Santa Cruz',
        lat:       -17.7820, lng: -63.1840,
        cat:       'a1000000-0000-0000-0000-000000000002',
        fee:       5.00, time: 25,
      },
      {
        id:        'b1000000-0000-0000-0000-000000000003',
        owner:     'admin.sushi@yayaeats.com',
        name:      'Sushi Zen',
        desc:      'Rolls y nigiri preparados con los mejores ingredientes frescos.',
        address:   'Calle Murillo #789, Santa Cruz',
        lat:       -17.7860, lng: -63.1780,
        cat:       'a1000000-0000-0000-0000-000000000003',
        fee:       10.00, time: 40,
      },
    ];

    for (const r of restaurants) {
      await queryRunner.query(
        `INSERT INTO shops
           (id, owner_account_id, name, description, address, latitude, longitude,
            category_id, delivery_fee, delivery_time_min, business_type)
         SELECT $1, a.id, $3, $4, $5, $6, $7, $8, $9, $10, 'restaurant'
           FROM accounts a WHERE a.email = $2
         ON CONFLICT (id) DO NOTHING`,
        [r.id, r.owner, r.name, r.desc, r.address, r.lat, r.lng, r.cat, r.fee, r.time],
      );
    }

    // ── vincular admins con sus restaurantes ──────────────────────────────
    await queryRunner.query(`
      UPDATE admins SET shop_id = 'b1000000-0000-0000-0000-000000000001'
      WHERE profile_id = (
        SELECT p.id FROM profiles p JOIN accounts a ON a.id = p.account_id
        WHERE a.email = 'admin.fogon@yayaeats.com'
      )
    `);
    await queryRunner.query(`
      UPDATE admins SET shop_id = 'b1000000-0000-0000-0000-000000000002'
      WHERE profile_id = (
        SELECT p.id FROM profiles p JOIN accounts a ON a.id = p.account_id
        WHERE a.email = 'admin.casona@yayaeats.com'
      )
    `);
    await queryRunner.query(`
      UPDATE admins SET shop_id = 'b1000000-0000-0000-0000-000000000003'
      WHERE profile_id = (
        SELECT p.id FROM profiles p JOIN accounts a ON a.id = p.account_id
        WHERE a.email = 'admin.sushi@yayaeats.com'
      )
    `);

    // ── menú: El Fogón Cruceño ─────────────────────────────────────────────
    await queryRunner.query(`
      INSERT INTO menu_categories (shop_id, name, sort_order) VALUES
        ('b1000000-0000-0000-0000-000000000001', 'Parrillas',   1),
        ('b1000000-0000-0000-0000-000000000001', 'Acompañados', 2),
        ('b1000000-0000-0000-0000-000000000001', 'Bebidas',     3)
    `);
    await queryRunner.query(`
      INSERT INTO menu_items (shop_id, category_id, name, price, preparation_time_min)
      SELECT 'b1000000-0000-0000-0000-000000000001', mc.id, item.name, item.price, item.prep
      FROM menu_categories mc
      JOIN (VALUES
        ('Parrillas',   'Asado de tira',       75.00, 30),
        ('Parrillas',   'Costillas al palo',   90.00, 40),
        ('Acompañados', 'Yuca frita',          20.00, 10),
        ('Acompañados', 'Ensalada mixta',      18.00,  8),
        ('Bebidas',     'Tujuré',              12.00,  3),
        ('Bebidas',     'Refresco natural',    10.00,  3)
      ) AS item(cat, name, price, prep) ON mc.name = item.cat
      WHERE mc.shop_id = 'b1000000-0000-0000-0000-000000000001'
    `);

    // ── menú: La Casona ────────────────────────────────────────────────────
    await queryRunner.query(`
      INSERT INTO menu_categories (shop_id, name, sort_order) VALUES
        ('b1000000-0000-0000-0000-000000000002', 'Platos principales', 1),
        ('b1000000-0000-0000-0000-000000000002', 'Sopas',              2),
        ('b1000000-0000-0000-0000-000000000002', 'Bebidas',            3)
    `);
    await queryRunner.query(`
      INSERT INTO menu_items (shop_id, category_id, name, price, preparation_time_min)
      SELECT 'b1000000-0000-0000-0000-000000000002', mc.id, item.name, item.price, item.prep
      FROM menu_categories mc
      JOIN (VALUES
        ('Platos principales', 'Majadito de charque',  55.00, 20),
        ('Platos principales', 'Arroz con leche',      35.00, 15),
        ('Sopas',              'Sopa de maní',         40.00, 25),
        ('Sopas',              'Locro de gallina',     45.00, 30),
        ('Bebidas',            'Mocochinchi',          10.00,  3),
        ('Bebidas',            'Chicha morada',        10.00,  3)
      ) AS item(cat, name, price, prep) ON mc.name = item.cat
      WHERE mc.shop_id = 'b1000000-0000-0000-0000-000000000002'
    `);

    // ── menú: Sushi Zen ────────────────────────────────────────────────────
    await queryRunner.query(`
      INSERT INTO menu_categories (shop_id, name, sort_order) VALUES
        ('b1000000-0000-0000-0000-000000000003', 'Rolls',    1),
        ('b1000000-0000-0000-0000-000000000003', 'Nigiri',   2),
        ('b1000000-0000-0000-0000-000000000003', 'Bebidas',  3)
    `);
    await queryRunner.query(`
      INSERT INTO menu_items (shop_id, category_id, name, price, preparation_time_min)
      SELECT 'b1000000-0000-0000-0000-000000000003', mc.id, item.name, item.price, item.prep
      FROM menu_categories mc
      JOIN (VALUES
        ('Rolls',   'Philadelphia Roll (8 pzs)', 65.00, 20),
        ('Rolls',   'Dragon Roll (8 pzs)',       80.00, 25),
        ('Rolls',   'Spicy Tuna Roll (8 pzs)',   70.00, 20),
        ('Nigiri',  'Salmón Nigiri (2 pzs)',      45.00, 15),
        ('Nigiri',  'Atún Nigiri (2 pzs)',        50.00, 15),
        ('Bebidas', 'Agua mineral',              10.00,  2),
        ('Bebidas', 'Té verde',                  12.00,  5)
      ) AS item(cat, name, price, prep) ON mc.name = item.cat
      WHERE mc.shop_id = 'b1000000-0000-0000-0000-000000000003'
    `);

    // ── system_config ─────────────────────────────────────────────────────
    await queryRunner.query(`
      INSERT INTO system_config (key, value, description) VALUES
        ('rider_location_interval_seconds', '5',    'Intervalo GPS del rider en segundos'),
        ('max_orders_per_group',            '3',    'Máximo de pedidos por grupo de delivery'),
        ('delivery_base_fee',               '5.00', 'Tarifa base de envío en Bs.')
      ON CONFLICT (key) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM shops WHERE id IN (
        'b1000000-0000-0000-0000-000000000001',
        'b1000000-0000-0000-0000-000000000002',
        'b1000000-0000-0000-0000-000000000003'
      )
    `);
    await queryRunner.query(`
      DELETE FROM shop_categories WHERE id LIKE 'a1000000%'
    `);
    await queryRunner.query(`
      DELETE FROM system_config WHERE key IN (
        'rider_location_interval_seconds', 'max_orders_per_group', 'delivery_base_fee'
      )
    `);
  }
}
