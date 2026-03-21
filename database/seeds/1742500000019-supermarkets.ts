import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Supermercados y minimarkets iniciales — YaYa Eats, Santa Cruz de la Sierra.
 * Agrega categorías de tipo supermercado/minimarket, tiendas y productos de muestra.
 */
export class Supermarkets1742500000019 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {

    // ── categorías de supermercado ────────────────────────────────────────
    await queryRunner.query(`
      INSERT INTO shop_categories (id, name, icon, sort_order, business_type) VALUES
        ('c1000000-0000-0000-0000-000000000001', 'Supermercado', '🛒', 1, 'supermarket'),
        ('c1000000-0000-0000-0000-000000000002', 'Mayorista',    '📦', 2, 'supermarket')
      ON CONFLICT (id) DO NOTHING
    `);

    // ── categorías de minimarket ──────────────────────────────────────────
    await queryRunner.query(`
      INSERT INTO shop_categories (id, name, icon, sort_order, business_type) VALUES
        ('c1000000-0000-0000-0000-000000000003', 'Minimarket',      '🏪', 1, 'minimarket'),
        ('c1000000-0000-0000-0000-000000000004', 'Tienda de barrio', '🏘️', 2, 'minimarket')
      ON CONFLICT (id) DO NOTHING
    `);

    // ── cuentas de administradores ────────────────────────────────────────
    const accounts = [
      { email: 'admin.sietesur@yayaeats.com',   password: 'admin123', roles: '{admin}' },
      { email: 'admin.hipermaxi@yayaeats.com',  password: 'admin123', roles: '{admin}' },
      { email: 'admin.donpedro@yayaeats.com',   password: 'admin123', roles: '{admin}' },
    ];
    for (const a of accounts) {
      await queryRunner.query(
        `INSERT INTO accounts (email, password, roles) VALUES ($1, $2, $3)
         ON CONFLICT (email) DO NOTHING`,
        [a.email, a.password, a.roles],
      );
    }

    // ── perfiles ──────────────────────────────────────────────────────────
    const profiles = [
      { email: 'admin.sietesur@yayaeats.com',  first_name: 'Rodrigo',  last_name: 'Suárez',    phone: '+591 70000013' },
      { email: 'admin.hipermaxi@yayaeats.com', first_name: 'Patricia', last_name: 'Montaño',   phone: '+591 70000014' },
      { email: 'admin.donpedro@yayaeats.com',  first_name: 'Pedro',    last_name: 'Justiniano', phone: '+591 70000015' },
    ];
    for (const p of profiles) {
      await queryRunner.query(
        `INSERT INTO profiles (account_id, first_name, last_name, phone)
         SELECT id, $2, $3, $4 FROM accounts WHERE email = $1
         ON CONFLICT (account_id) DO NOTHING`,
        [p.email, p.first_name, p.last_name, p.phone],
      );
    }

    // ── registros de admin ────────────────────────────────────────────────
    for (const email of accounts.map((a) => a.email)) {
      await queryRunner.query(
        `INSERT INTO admins (profile_id)
         SELECT p.id FROM profiles p JOIN accounts a ON a.id = p.account_id
         WHERE a.email = $1
         ON CONFLICT (profile_id) DO NOTHING`,
        [email],
      );
    }

    // ── tiendas ───────────────────────────────────────────────────────────
    const stores = [
      {
        id:    'd1000000-0000-0000-0000-000000000001',
        owner: 'admin.sietesur@yayaeats.com',
        name:  'Supermercado 7 Sur',
        desc:  'Tu supermercado de confianza con los mejores precios de Santa Cruz.',
        address: 'Av. San Martín #750, Santa Cruz',
        lat: -17.7895, lng: -63.1760,
        cat: 'c1000000-0000-0000-0000-000000000001',
        fee: 6.00, time: 45,
        businessType: 'supermarket',
      },
      {
        id:    'd1000000-0000-0000-0000-000000000002',
        owner: 'admin.hipermaxi@yayaeats.com',
        name:  'Hipermaxi',
        desc:  'El hipermercado más grande de Bolivia con todo lo que necesitás.',
        address: 'Av. Cristo Redentor #1200, Santa Cruz',
        lat: -17.7910, lng: -63.1720,
        cat: 'c1000000-0000-0000-0000-000000000001',
        fee: 8.00, time: 50,
        businessType: 'supermarket',
      },
      {
        id:    'd1000000-0000-0000-0000-000000000003',
        owner: 'admin.donpedro@yayaeats.com',
        name:  'Minimarket Don Pedro',
        desc:  'Lo que necesitás a pocas cuadras. Rápido y conveniente.',
        address: 'Calle Beni #320, Santa Cruz',
        lat: -17.7825, lng: -63.1815,
        cat: 'c1000000-0000-0000-0000-000000000003',
        fee: 3.00, time: 20,
        businessType: 'minimarket',
      },
    ];

    for (const s of stores) {
      await queryRunner.query(
        `INSERT INTO shops
           (id, owner_account_id, name, description, address, latitude, longitude,
            category_id, delivery_fee, delivery_time_min, business_type)
         SELECT $1, a.id, $3, $4, $5, $6, $7, $8, $9, $10, $11
           FROM accounts a WHERE a.email = $2
         ON CONFLICT (id) DO NOTHING`,
        [s.id, s.owner, s.name, s.desc, s.address, s.lat, s.lng, s.cat, s.fee, s.time, s.businessType],
      );
    }

    // ── vincular admins con sus tiendas ───────────────────────────────────
    const links = [
      { email: 'admin.sietesur@yayaeats.com',  storeId: 'd1000000-0000-0000-0000-000000000001' },
      { email: 'admin.hipermaxi@yayaeats.com', storeId: 'd1000000-0000-0000-0000-000000000002' },
      { email: 'admin.donpedro@yayaeats.com',  storeId: 'd1000000-0000-0000-0000-000000000003' },
    ];
    for (const l of links) {
      await queryRunner.query(
        `UPDATE admins SET shop_id = $2
         WHERE profile_id = (
           SELECT p.id FROM profiles p JOIN accounts a ON a.id = p.account_id
           WHERE a.email = $1
         )`,
        [l.email, l.storeId],
      );
    }

    // ── catálogo: Supermercado 7 Sur ──────────────────────────────────────
    await queryRunner.query(`
      INSERT INTO menu_categories (shop_id, name, sort_order) VALUES
        ('d1000000-0000-0000-0000-000000000001', 'Frutas y Verduras',   1),
        ('d1000000-0000-0000-0000-000000000001', 'Carnes y Embutidos',  2),
        ('d1000000-0000-0000-0000-000000000001', 'Lácteos y Huevos',    3),
        ('d1000000-0000-0000-0000-000000000001', 'Bebidas',             4),
        ('d1000000-0000-0000-0000-000000000001', 'Panadería',           5),
        ('d1000000-0000-0000-0000-000000000001', 'Limpieza y Hogar',    6),
        ('d1000000-0000-0000-0000-000000000001', 'Snacks y Dulces',     7)
    `);
    await queryRunner.query(`
      INSERT INTO menu_items (shop_id, category_id, name, price, preparation_time_min, stock)
      SELECT 'd1000000-0000-0000-0000-000000000001', mc.id, item.name, item.price, 5, item.stock
      FROM menu_categories mc
      JOIN (VALUES
        ('Frutas y Verduras',  'Manzana roja (kg)',          8.50,  50),
        ('Frutas y Verduras',  'Banana (kg)',                5.00, 100),
        ('Frutas y Verduras',  'Lechuga (unidad)',           4.00,  30),
        ('Frutas y Verduras',  'Tomate (kg)',                7.00,  60),
        ('Frutas y Verduras',  'Papa (kg)',                  4.50,  80),
        ('Carnes y Embutidos', 'Pechuga de pollo (kg)',     35.00,  20),
        ('Carnes y Embutidos', 'Carne molida (kg)',         50.00,  15),
        ('Carnes y Embutidos', 'Salchicha Frankfurt (pkg)',  18.00,  25),
        ('Carnes y Embutidos', 'Jamón cocido (pkg)',        22.00,  20),
        ('Lácteos y Huevos',   'Leche PIL 1L',              8.50,  60),
        ('Lácteos y Huevos',   'Queso criollo (250g)',      15.00,  30),
        ('Lácteos y Huevos',   'Yogur natural 200g',         6.00,  40),
        ('Lácteos y Huevos',   'Huevo (unidad)',             1.50, 200),
        ('Bebidas',            'Coca-Cola 2L',              12.00,  50),
        ('Bebidas',            'Agua Vital 1.5L',            5.00,  80),
        ('Bebidas',            'Jugo Del Valle 1L',          9.00,  40),
        ('Bebidas',            'Cerveza Paceña (lata)',      9.50,  60),
        ('Panadería',          'Pan de batalla (unidad)',    0.50, 150),
        ('Panadería',          'Marraqueta (unidad)',        0.80, 100),
        ('Panadería',          'Bizcocho (100g)',            8.00,  40),
        ('Limpieza y Hogar',   'Detergente Ariel 500g',    18.00,  30),
        ('Limpieza y Hogar',   'Jabón lavavajillas',         7.00,  35),
        ('Limpieza y Hogar',   'Papel higiénico (4 rollos)',14.00,  25),
        ('Snacks y Dulces',    'Chips Lay''s 150g',         10.00,  40),
        ('Snacks y Dulces',    'Galletas Oreo',              8.50,  45),
        ('Snacks y Dulces',    'Chocolate Sublime',          5.00,  50)
      ) AS item(cat, name, price, stock) ON mc.name = item.cat
      WHERE mc.shop_id = 'd1000000-0000-0000-0000-000000000001'
    `);

    // ── catálogo: Hipermaxi ───────────────────────────────────────────────
    await queryRunner.query(`
      INSERT INTO menu_categories (shop_id, name, sort_order) VALUES
        ('d1000000-0000-0000-0000-000000000002', 'Frutas y Verduras',  1),
        ('d1000000-0000-0000-0000-000000000002', 'Carnes',             2),
        ('d1000000-0000-0000-0000-000000000002', 'Lácteos',            3),
        ('d1000000-0000-0000-0000-000000000002', 'Bebidas',            4),
        ('d1000000-0000-0000-0000-000000000002', 'Limpieza',           5),
        ('d1000000-0000-0000-0000-000000000002', 'Panadería',          6),
        ('d1000000-0000-0000-0000-000000000002', 'Congelados',         7)
    `);
    await queryRunner.query(`
      INSERT INTO menu_items (shop_id, category_id, name, price, preparation_time_min, stock)
      SELECT 'd1000000-0000-0000-0000-000000000002', mc.id, item.name, item.price, 5, item.stock
      FROM menu_categories mc
      JOIN (VALUES
        ('Frutas y Verduras', 'Naranja (kg)',              6.00,  80),
        ('Frutas y Verduras', 'Uva (kg)',                 25.00,  20),
        ('Frutas y Verduras', 'Zanahoria (kg)',            5.00,  60),
        ('Carnes',            'Bife de chorizo (kg)',     80.00,  10),
        ('Carnes',            'Pollo entero (kg)',        25.00,  20),
        ('Carnes',            'Costillas de cerdo (kg)',  45.00,  15),
        ('Lácteos',           'Leche PIL 1L',             8.50,  80),
        ('Lácteos',           'Mantequilla 200g',        18.00,  30),
        ('Lácteos',           'Crema de leche 200ml',    12.00,  25),
        ('Bebidas',           'Pepsi 2L',                11.00,  50),
        ('Bebidas',           'Agua mineral 600ml',       4.00, 100),
        ('Bebidas',           'Vino Santa Helena 750ml', 55.00,  20),
        ('Limpieza',          'Lavandina 1L',            10.00,  30),
        ('Limpieza',          'Suavizante Downy',        22.00,  25),
        ('Panadería',         'Pan integral (500g)',     12.00,  20),
        ('Panadería',         'Croissant (unidad)',        5.00,  30),
        ('Congelados',        'Pizza congelada',         35.00,  15),
        ('Congelados',        'Helado Bresler 1L',       30.00,  20)
      ) AS item(cat, name, price, stock) ON mc.name = item.cat
      WHERE mc.shop_id = 'd1000000-0000-0000-0000-000000000002'
    `);

    // ── catálogo: Minimarket Don Pedro ────────────────────────────────────
    await queryRunner.query(`
      INSERT INTO menu_categories (shop_id, name, sort_order) VALUES
        ('d1000000-0000-0000-0000-000000000003', 'Bebidas',           1),
        ('d1000000-0000-0000-0000-000000000003', 'Snacks',            2),
        ('d1000000-0000-0000-0000-000000000003', 'Lácteos',           3),
        ('d1000000-0000-0000-0000-000000000003', 'Higiene Personal',  4),
        ('d1000000-0000-0000-0000-000000000003', 'Básicos',           5)
    `);
    await queryRunner.query(`
      INSERT INTO menu_items (shop_id, category_id, name, price, preparation_time_min, stock)
      SELECT 'd1000000-0000-0000-0000-000000000003', mc.id, item.name, item.price, 5, item.stock
      FROM menu_categories mc
      JOIN (VALUES
        ('Bebidas',          'Coca-Cola 600ml',        6.00, 30),
        ('Bebidas',          'Agua 500ml',             3.00, 50),
        ('Bebidas',          'Energizante Red Bull',  12.00, 15),
        ('Snacks',           'Chips 100g',             5.50, 25),
        ('Snacks',           'Maní tostado 100g',      4.00, 30),
        ('Snacks',           'Galletas surtidas',      7.00, 20),
        ('Lácteos',          'Leche PIL 1L',           8.50, 15),
        ('Lácteos',          'Yogur 200g',             6.00, 10),
        ('Higiene Personal', 'Jabón de manos',         8.00, 20),
        ('Higiene Personal', 'Papel higiénico (2u)',   7.00, 15),
        ('Básicos',          'Azúcar 1kg',            10.00, 10),
        ('Básicos',          'Aceite 1L',             14.00, 10),
        ('Básicos',          'Sal 1kg',                4.00, 15)
      ) AS item(cat, name, price, stock) ON mc.name = item.cat
      WHERE mc.shop_id = 'd1000000-0000-0000-0000-000000000003'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM shops WHERE id IN (
        'd1000000-0000-0000-0000-000000000001',
        'd1000000-0000-0000-0000-000000000002',
        'd1000000-0000-0000-0000-000000000003'
      )
    `);
    await queryRunner.query(`
      DELETE FROM shop_categories WHERE id LIKE 'c1000000%'
    `);
    await queryRunner.query(`
      DELETE FROM accounts WHERE email IN (
        'admin.sietesur@yayaeats.com',
        'admin.hipermaxi@yayaeats.com',
        'admin.donpedro@yayaeats.com'
      )
    `);
  }
}
