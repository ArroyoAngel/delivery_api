import { MigrationInterface, QueryRunner } from 'typeorm';

const ZONE_SC = 'a0000010-0000-0000-0000-000000000001';
const ZONE_MONTERO = 'a0000010-0000-0000-0000-000000000002';

export class DeliveryZones1742700000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Tabla delivery_zones ───────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE delivery_zones (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name           VARCHAR(100) NOT NULL,
        city           VARCHAR(100) NOT NULL,
        center_lat     DECIMAL(10,7) NOT NULL,
        center_lng     DECIMAL(10,7) NOT NULL,
        radius_meters  INT NOT NULL DEFAULT 5000,
        is_active      BOOLEAN NOT NULL DEFAULT true,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ── 2. Seed: zonas iniciales ──────────────────────────────────────────
    await queryRunner.query(`
      INSERT INTO delivery_zones (id, name, city, center_lat, center_lng, radius_meters)
      VALUES
        ('${ZONE_SC}',      'Santa Cruz Centro', 'Santa Cruz', -17.7832, -63.1975, 15000),
        ('${ZONE_MONTERO}', 'Montero',           'Montero',   -17.3407, -63.2538,  8000)
    `);

    // ── 3. FK en shops ────────────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE shops
        ADD COLUMN IF NOT EXISTS zone_id UUID,
        ADD CONSTRAINT fk_shop_zone
          FOREIGN KEY (zone_id) REFERENCES delivery_zones(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_shops_zone ON shops(zone_id)`);

    // Auto-asignar negocios existentes por coordenadas (radio 20 km de Santa Cruz)
    await queryRunner.query(`
      UPDATE shops SET zone_id = '${ZONE_SC}'
      WHERE latitude IS NOT NULL AND longitude IS NOT NULL
        AND zone_id IS NULL
        AND (
          6371000 * acos(LEAST(1.0,
            cos(radians(-17.7832)) * cos(radians(latitude::float)) *
            cos(longitude::float * pi()/180 - radians(-63.1975)) +
            sin(radians(-17.7832)) * sin(radians(latitude::float))
          ))
        ) <= 20000
    `);

    // ── 4. FK en riders (zona base) ───────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE riders
        ADD COLUMN IF NOT EXISTS zone_id UUID,
        ADD CONSTRAINT fk_rider_zone
          FOREIGN KEY (zone_id) REFERENCES delivery_zones(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`CREATE INDEX idx_riders_zone ON riders(zone_id)`);

    // ── 5. Casbin: reglas para /api/zones ─────────────────────────────────
    await queryRunner.query(`
      INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4) VALUES
        ('p', 'superadmin', '/api/zones',     'GET|POST',          'allow', 'backend'),
        ('p', 'superadmin', '/api/zones/:id', 'GET|PATCH|DELETE',  'allow', 'backend'),
        ('p', 'superadmin', '/api/zones/detect', 'GET',            'allow', 'backend'),
        ('p', 'admin',      '/api/zones',     'GET',               'allow', 'backend'),
        ('p', 'admin',      '/api/zones/detect', 'GET',            'allow', 'backend'),
        ('p', 'client',     '/api/zones/detect', 'GET',            'allow', 'backend'),
        ('p', 'superadmin', '/dashboard/zones', 'VIEW',            'allow', 'frontend')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM casbin_rule WHERE v1 LIKE '/api/zones%' OR v1 = '/dashboard/zones'`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_riders_zone`);
    await queryRunner.query(`ALTER TABLE riders DROP CONSTRAINT IF EXISTS fk_rider_zone`);
    await queryRunner.query(`ALTER TABLE riders DROP COLUMN IF EXISTS zone_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_shops_zone`);
    await queryRunner.query(`ALTER TABLE shops DROP CONSTRAINT IF EXISTS fk_shop_zone`);
    await queryRunner.query(`ALTER TABLE shops DROP COLUMN IF EXISTS zone_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS delivery_zones`);
  }
}
