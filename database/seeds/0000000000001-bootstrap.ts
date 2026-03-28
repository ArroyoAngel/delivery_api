import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Datos esenciales del sistema — sin datos de prueba.
 *
 * Incluye:
 *   - Roles base (superadmin, admin, rider, client)
 *   - Cuenta superadmin
 *   - Zonas de delivery (Santa Cruz + Montero)
 *   - Categorías de tienda
 *   - Configuración del sistema
 *   - Tipos de negocio
 *   - Opciones de área/zona (area_kind_options)
 *   - Paquetes de crédito por defecto
 */
export class Bootstrap0000000000001 implements MigrationInterface {
  name = 'Bootstrap0000000000001';

  public async up(qr: QueryRunner): Promise<void> {

    // ── ROLES ──────────────────────────────────────────────────────────────
    await qr.query(`
      INSERT INTO roles (name, parent_id, profile_type, is_system, description) VALUES
        ('superadmin', NULL, NULL,     true, 'Administrador global de la plataforma'),
        ('admin',      NULL, 'admin',  true, 'Administrador de negocio'),
        ('rider',      NULL, 'rider',  true, 'Repartidor'),
        ('client',     NULL, 'client', true, 'Cliente')
      ON CONFLICT (name) DO NOTHING
    `);

    // ── SUPERADMIN ─────────────────────────────────────────────────────────
    await qr.query(`
      INSERT INTO accounts (email, password, roles)
      VALUES ('luis@gmail.com', 'luis123', '{superadmin}')
      ON CONFLICT (email) DO NOTHING
    `);

    await qr.query(`
      INSERT INTO profiles (account_id, first_name, last_name, phone)
      SELECT id, 'Luis', 'Arroyo', '+591 70000001'
      FROM accounts WHERE email = 'luis@gmail.com'
      ON CONFLICT (account_id) DO NOTHING
    `);

    // ── ZONAS DE DELIVERY ──────────────────────────────────────────────────
    await qr.query(`
      INSERT INTO delivery_zones (id, name, city, center_lat, center_lng, radius_meters) VALUES
        ('a0000010-0000-0000-0000-000000000001', 'Santa Cruz Centro', 'Santa Cruz', -17.7832, -63.1975, 15000),
        ('a0000010-0000-0000-0000-000000000002', 'Montero',           'Montero',   -17.3407, -63.2538,  8000)
      ON CONFLICT (id) DO NOTHING
    `);

    // ── CATEGORÍAS DE TIENDA ───────────────────────────────────────────────
    await qr.query(`
      INSERT INTO shop_categories (id, name, icon, sort_order, business_type) VALUES
        ('a1000000-0000-0000-0000-000000000001', 'Parrilla',     '🥩', 1, 'restaurant'),
        ('a1000000-0000-0000-0000-000000000002', 'Criolla',      '🍲', 2, 'restaurant'),
        ('a1000000-0000-0000-0000-000000000003', 'Sushi',        '🍣', 3, 'restaurant'),
        ('a1000000-0000-0000-0000-000000000004', 'Hamburguesas', '🍔', 4, 'restaurant'),
        ('a1000000-0000-0000-0000-000000000005', 'Pizza',        '🍕', 5, 'restaurant'),
        ('a1000000-0000-0000-0000-000000000006', 'Pollo',        '🍗', 6, 'restaurant'),
        ('a1000000-0000-0000-0000-000000000007', 'Supermercado', '🛒', 1, 'supermarket'),
        ('a1000000-0000-0000-0000-000000000008', 'Minimarket',   '🏪', 1, 'minimarket'),
        ('a1000000-0000-0000-0000-000000000009', 'Cafetería',    '☕', 1, 'cafe'),
        ('a1000000-0000-0000-0000-000000000010', 'Farmacia',     '💊', 1, 'pharmacy')
      ON CONFLICT (id) DO NOTHING
    `);

    // ── CONFIGURACIÓN DEL SISTEMA ──────────────────────────────────────────
    await qr.query(`
      INSERT INTO system_config (key, value, description) VALUES
        ('rider_location_interval_seconds', '5',     'Intervalo GPS del rider en segundos'),
        ('max_orders_per_group',            '3',     'Máximo de pedidos por grupo de delivery'),
        ('delivery_base_fee',               '5.00',  'Tarifa base de envío en Bs.'),
        ('nearby_shop_radius_meters',       '5000',  'Radio de búsqueda de tiendas cercanas en metros'),
        ('shop_commission_pct',             '10',    'Porcentaje de comisión de plataforma por pedido')
      ON CONFLICT (key) DO NOTHING
    `);

    // ── TIPOS DE NEGOCIO ───────────────────────────────────────────────────
    await qr.query(`
      INSERT INTO business_types (value, label, sort_order, service_category, flutter_icon, bg_color, icon_color, web_icon) VALUES
        ('restaurant',  'Restaurante', 1, 'food',   'restaurant_menu',    '#FFF3E0', '#F57C00', 'UtensilsCrossed'),
        ('cafe',        'Cafetería',   4, 'food',   'local_cafe',         '#FFF8E1', '#F9A825', 'Coffee'),
        ('supermarket', 'Supermercado',2, 'market', 'local_grocery_store','#E8F5E9', '#388E3C', 'ShoppingCart'),
        ('minimarket',  'Minimarket',  3, 'market', 'storefront',         '#E3F2FD', '#1976D2', 'Store'),
        ('pharmacy',    'Farmacia',    5, 'health', 'local_pharmacy',     '#FCE4EC', '#C2185B', 'Pill')
      ON CONFLICT (value) DO NOTHING
    `);

    // ── OPCIONES DE ÁREA/ZONA ──────────────────────────────────────────────
    await qr.query(`
      INSERT INTO area_kind_options (value, label, web_icon, color, sort_order, type) VALUES
        ('mesa',    'Mesa',    'UtensilsCrossed', '#f97316', 1, 'mesa'),
        ('barra',   'Barra',   'Wine',            '#0ea5e9', 2, 'zona'),
        ('salon',   'Salón',   'Users',           '#a855f7', 3, 'zona'),
        ('terraza', 'Terraza', 'Sun',             '#22c55e', 4, 'seccion')
      ON CONFLICT (value) DO UPDATE
        SET label = EXCLUDED.label,
            web_icon = EXCLUDED.web_icon,
            color = EXCLUDED.color,
            sort_order = EXCLUDED.sort_order,
            type = EXCLUDED.type
    `);

    // ── PAQUETES DE CRÉDITO ────────────────────────────────────────────────
    await qr.query(`
      INSERT INTO credit_packages (name, credits, bonus_credits, price, sort_order) VALUES
        ('Pack Básico',   100,  0, 100.00, 1),
        ('Pack Pro',      200, 20, 200.00, 2),
        ('Pack Premium',  500, 75, 500.00, 3)
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DELETE FROM credit_packages`);
    await qr.query(`DELETE FROM area_kind_options`);
    await qr.query(`DELETE FROM business_types`);
    await qr.query(`DELETE FROM system_config`);
    await qr.query(`DELETE FROM shop_categories`);
    await qr.query(`DELETE FROM delivery_zones`);
    await qr.query(`DELETE FROM profiles WHERE account_id IN (SELECT id FROM accounts WHERE email = 'luis@gmail.com')`);
    await qr.query(`DELETE FROM accounts WHERE email = 'luis@gmail.com'`);
    await qr.query(`DELETE FROM roles WHERE is_system = true`);
  }
}
