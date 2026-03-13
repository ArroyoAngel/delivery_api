import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Usuarios iniciales de YaYa Eats — Santa Cruz de la Sierra, Bolivia.
 * Coordenadas centradas en Plaza 24 de Septiembre (-17.7834, -63.1820).
 * AUTH_PLAIN_PASSWORD=true en .env → contraseñas en texto plano.
 */
export class AccountsAndProfiles1742500000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {

    // ── accounts ──────────────────────────────────────────────────────────
    const accounts = [
      { email: 'luis@gmail.com',              password: 'luis123',   roles: '{superadmin}' },
      { email: 'admin.fogon@yayaeats.com',    password: 'admin123',  roles: '{admin}' },
      { email: 'admin.casona@yayaeats.com',   password: 'admin123',  roles: '{admin}' },
      { email: 'admin.sushi@yayaeats.com',    password: 'admin123',  roles: '{admin}' },
      { email: 'rider1@yayaeats.com',         password: 'rider123',  roles: '{rider}' },
      { email: 'rider2@yayaeats.com',         password: 'rider123',  roles: '{rider}' },
      { email: 'rider3@yayaeats.com',         password: 'rider123',  roles: '{rider}' },
      { email: 'ana.garcia@gmail.com',        password: 'client123', roles: '{client}' },
      { email: 'carlos.mendez@gmail.com',     password: 'client123', roles: '{client}' },
      { email: 'sofia.vargas@gmail.com',      password: 'client123', roles: '{client}' },
      { email: 'miguel.torrez@gmail.com',     password: 'client123', roles: '{client}' },
      { email: 'valeria.suarez@gmail.com',    password: 'client123', roles: '{client}' },
    ];

    for (const a of accounts) {
      await queryRunner.query(
        `INSERT INTO accounts (email, password, roles)
         VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING`,
        [a.email, a.password, a.roles],
      );
    }

    // ── profiles ──────────────────────────────────────────────────────────
    const profiles = [
      { email: 'luis@gmail.com',            first_name: 'Luis',     last_name: 'Arroyo',     phone: '+591 70000001' },
      { email: 'admin.fogon@yayaeats.com',  first_name: 'Roberto',  last_name: 'Pedraza',    phone: '+591 70000002' },
      { email: 'admin.casona@yayaeats.com', first_name: 'Carmen',   last_name: 'Justiniano', phone: '+591 70000003' },
      { email: 'admin.sushi@yayaeats.com',  first_name: 'Kenji',    last_name: 'Yamamoto',   phone: '+591 70000004' },
      { email: 'rider1@yayaeats.com',       first_name: 'Diego',    last_name: 'Chávez',     phone: '+591 70000005' },
      { email: 'rider2@yayaeats.com',       first_name: 'Marco',    last_name: 'Ribera',     phone: '+591 70000006' },
      { email: 'rider3@yayaeats.com',       first_name: 'Patricia', last_name: 'Vaca',       phone: '+591 70000007' },
      { email: 'ana.garcia@gmail.com',      first_name: 'Ana',      last_name: 'García',     phone: '+591 70000008' },
      { email: 'carlos.mendez@gmail.com',   first_name: 'Carlos',   last_name: 'Méndez',     phone: '+591 70000009' },
      { email: 'sofia.vargas@gmail.com',    first_name: 'Sofía',    last_name: 'Vargas',     phone: '+591 70000010' },
      { email: 'miguel.torrez@gmail.com',   first_name: 'Miguel',   last_name: 'Torrez',     phone: '+591 70000011' },
      { email: 'valeria.suarez@gmail.com',  first_name: 'Valeria',  last_name: 'Suárez',     phone: '+591 70000012' },
    ];

    for (const p of profiles) {
      await queryRunner.query(
        `INSERT INTO profiles (account_id, first_name, last_name, phone)
         SELECT id, $2, $3, $4 FROM accounts WHERE email = $1
         ON CONFLICT (account_id) DO NOTHING`,
        [p.email, p.first_name, p.last_name, p.phone],
      );
    }

    // ── admins ────────────────────────────────────────────────────────────
    const adminEmails = [
      'admin.fogon@yayaeats.com',
      'admin.casona@yayaeats.com',
      'admin.sushi@yayaeats.com',
    ];
    for (const email of adminEmails) {
      await queryRunner.query(
        `INSERT INTO admins (profile_id)
         SELECT p.id FROM profiles p
           JOIN accounts a ON a.id = p.account_id
         WHERE a.email = $1
         ON CONFLICT (profile_id) DO NOTHING`,
        [email],
      );
    }

    // ── riders ────────────────────────────────────────────────────────────
    const riderData = [
      { email: 'rider1@yayaeats.com', vehicle: 'moto', lat: -17.7815, lng: -63.1830, available: true  },
      { email: 'rider2@yayaeats.com', vehicle: 'moto', lat: -17.7850, lng: -63.1800, available: true  },
      { email: 'rider3@yayaeats.com', vehicle: 'bici', lat: -17.7800, lng: -63.1855, available: false },
    ];
    for (const r of riderData) {
      await queryRunner.query(
        `INSERT INTO riders (profile_id, vehicle_type, is_available, lat, lng)
         SELECT p.id, $2, $3, $4, $5 FROM profiles p
           JOIN accounts a ON a.id = p.account_id
         WHERE a.email = $1
         ON CONFLICT (profile_id) DO NOTHING`,
        [r.email, r.vehicle, r.available, r.lat, r.lng],
      );
    }

    // ── clients ───────────────────────────────────────────────────────────
    const clientEmails = [
      'ana.garcia@gmail.com',
      'carlos.mendez@gmail.com',
      'sofia.vargas@gmail.com',
      'miguel.torrez@gmail.com',
      'valeria.suarez@gmail.com',
    ];
    for (const email of clientEmails) {
      await queryRunner.query(
        `INSERT INTO clients (profile_id)
         SELECT p.id FROM profiles p
           JOIN accounts a ON a.id = p.account_id
         WHERE a.email = $1
         ON CONFLICT (profile_id) DO NOTHING`,
        [email],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const emails = [
      'luis@gmail.com',
      'admin.fogon@yayaeats.com', 'admin.casona@yayaeats.com', 'admin.sushi@yayaeats.com',
      'rider1@yayaeats.com', 'rider2@yayaeats.com', 'rider3@yayaeats.com',
      'ana.garcia@gmail.com', 'carlos.mendez@gmail.com', 'sofia.vargas@gmail.com',
      'miguel.torrez@gmail.com', 'valeria.suarez@gmail.com',
    ];
    await queryRunner.query(`DELETE FROM accounts WHERE email = ANY($1)`, [emails]);
  }
}
