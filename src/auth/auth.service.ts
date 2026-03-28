import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AccountEntity } from './account.entity';
import { ProfileEntity } from '../profiles/profile.entity';
import { ClientEntity } from '../profiles/client.entity';
import * as admin from 'firebase-admin';
import { Resend } from 'resend';

@Injectable()
export class AuthService {
  private resend: Resend | null = null;

  constructor(
    @InjectRepository(AccountEntity)
    private accounts: Repository<AccountEntity>,
    @InjectRepository(ProfileEntity)
    private profiles: Repository<ProfileEntity>,
    @InjectRepository(ClientEntity)
    private clientRepo: Repository<ClientEntity>,
    private jwt: JwtService,
    private dataSource: DataSource,
    private config: ConfigService,
  ) {
    const key = this.config.get<string>('RESEND_API_KEY', '');
    if (key) this.resend = new Resend(key);
  }

  private token(account: AccountEntity) {
    return {
      accessToken: this.jwt.sign({
        sub: account.id,
        email: account.email,
        roles: account.roles,
      }),
    };
  }

  // ── Email OTP ────────────────────────────────────────────────────────────

  /** Genera y envía un OTP de 6 dígitos al email dado. */
  async sendEmailOtp(email: string): Promise<void> {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos

    // Invalida OTPs anteriores para este email
    await this.dataSource.query(
      `UPDATE email_otps SET used = true WHERE email = $1 AND used = false`,
      [email],
    );

    await this.dataSource.query(
      `INSERT INTO email_otps (email, code, expires_at) VALUES ($1, $2, $3)`,
      [email, code, expiresAt],
    );

    if (!this.resend) {
      throw new BadRequestException('El servicio de email no está configurado en el servidor');
    }
    const fromEmail = this.config.get('RESEND_FROM_EMAIL', 'onboarding@resend.dev');
    const { data, error } = await this.resend.emails.send({
      from: fromEmail,
      to: email,
      subject: 'Tu código de verificación — YaYa Eats',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px">
          <h2 style="color:#f97316;margin-bottom:8px">YaYa Eats</h2>
          <p style="color:#444;margin-bottom:24px">Tu código de verificación es:</p>
          <div style="background:#fff7ed;border:2px solid #f97316;border-radius:12px;padding:24px;text-align:center">
            <span style="font-size:40px;font-weight:700;letter-spacing:12px;color:#f97316">${code}</span>
          </div>
          <p style="color:#666;font-size:13px;margin-top:20px">
            Válido por <strong>10 minutos</strong>. No compartas este código con nadie.
          </p>
        </div>
      `,
    });

    if (error) {
      // Revertir el OTP guardado si el email no pudo enviarse
      await this.dataSource.query(
        `UPDATE email_otps SET used = true WHERE email = $1 AND used = false`,
        [email],
      );
      throw new BadRequestException(`No se pudo enviar el email: ${error.message}`);
    }

    console.log(`[Auth] OTP enviado a ${email} — id: ${data?.id}`);
  }

  /** Verifica el OTP y completa el registro. Retorna JWT si el código es correcto. */
  async verifyEmailOtpAndRegister(params: {
    email: string;
    code: string;
    password: string;
    firstName: string;
    lastName: string;
  }): Promise<{ accessToken: string }> {
    const row = await this.dataSource.query(
      `SELECT * FROM email_otps
       WHERE email = $1 AND code = $2 AND used = false AND expires_at > now()
       ORDER BY created_at DESC LIMIT 1`,
      [params.email, params.code],
    );

    if (!row.length) {
      throw new BadRequestException('Código incorrecto o expirado');
    }

    // Marcar como usado
    await this.dataSource.query(
      `UPDATE email_otps SET used = true WHERE id = $1`,
      [row[0].id],
    );

    // Crear cuenta
    const exists = await this.accounts.findOne({ where: { email: params.email } });
    if (exists) throw new ConflictException('Email ya registrado');

    const account = await this.accounts.save(
      this.accounts.create({ email: params.email, password: params.password }),
    );

    // Crear perfil con nombre
    await this.dataSource.query(
      `INSERT INTO profiles (id, account_id, first_name, last_name)
       VALUES (gen_random_uuid(), $1, $2, $3)
       ON CONFLICT (account_id) DO UPDATE SET first_name = $2, last_name = $3`,
      [account.id, params.firstName, params.lastName],
    );

    // Crear registro en clients
    await this.dataSource.query(
      `INSERT INTO clients (id, profile_id)
       SELECT gen_random_uuid(), p.id FROM profiles p WHERE p.account_id = $1
       ON CONFLICT (profile_id) DO NOTHING`,
      [account.id],
    );

    return this.token(account);
  }

  async login(email: string, password: string) {
    const account = await this.accounts.findOne({ where: { email } });
    const plainMode = process.env.AUTH_PLAIN_PASSWORD === 'true';
    if (
      !account ||
      (plainMode
        ? account.password !== password
        : account.password !== password)
    ) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Bloquear login si el shop del usuario está deshabilitado
    const shopRoles = ['admin', 'cashier', 'staff'];
    if (account.roles.some((r) => shopRoles.includes(r))) {
      const [shop] = await this.dataSource.query(
        `SELECT s.status FROM shops s
         LEFT JOIN admins a ON a.shop_id = s.id
         LEFT JOIN profiles p ON p.id = a.profile_id
         WHERE s.owner_account_id = $1
            OR p.account_id = $1
         LIMIT 1`,
        [account.id],
      );
      if (shop?.status === 'disabled') {
        const [cfg] = await this.dataSource.query(
          `SELECT value FROM system_config WHERE key = 'allow_inactive_shop_login'`,
        );
        const allowLogin = cfg?.value === 'true';
        if (!allowLogin) {
          throw new UnauthorizedException('Tu negocio está deshabilitado. Contacta al administrador.');
        }
      }
    }

    return this.token(account);
  }

  async register(
    email: string,
    password: string,
    firstName: string,
    lastName: string,
  ) {
    const exists = await this.accounts.findOne({ where: { email } });
    if (exists) throw new ConflictException('Email ya registrado');
    const account = await this.accounts.save(
      this.accounts.create({ email, password }),
    );
    return this.token(account);
  }

  /** Verifica un Firebase ID token (phone auth, email link, etc.) y retorna JWT de la plataforma.
   *  - Phone auth: crea cuenta con phone_id; email placeholder generado internamente.
   *  - Email auth: busca/crea por email.
   */
  async firebaseLogin(idToken: string) {
    let decoded: admin.auth.DecodedIdToken;
    try {
      // Usa el app ya inicializado por NotificationsService (singleton de firebase-admin)
      decoded = await admin.auth().verifyIdToken(idToken);
    } catch {
      throw new BadRequestException('Firebase token inválido');
    }

    const { uid, phone_number: phone, email } = decoded as any;

    // ── Phone-based sign-in ──────────────────────────────────────────────
    if (phone) {
      let account = await this.accounts.findOne({ where: { phoneId: uid } });
      if (!account) {
        // Crear cuenta con email placeholder — no se usa para autenticación
        const placeholder = `phone:${uid}@yayaeats.local`;
        account = await this.accounts.save(
          this.accounts.create({ email: placeholder, phoneId: uid }),
        );
        // Guardar el número de teléfono en el perfil
        await this.dataSource.query(
          `INSERT INTO profiles (id, account_id, phone)
           VALUES (gen_random_uuid(), $1, $2)
           ON CONFLICT (account_id) DO UPDATE SET phone = EXCLUDED.phone`,
          [account.id, phone],
        );
        // Crear registro en clients
        await this.dataSource.query(
          `INSERT INTO clients (id, profile_id)
           SELECT gen_random_uuid(), p.id FROM profiles p WHERE p.account_id = $1
           ON CONFLICT (profile_id) DO NOTHING`,
          [account.id],
        );
      }
      return this.token(account);
    }

    // ── Email-based Firebase sign-in ─────────────────────────────────────
    if (email) {
      let account = await this.accounts.findOne({ where: { email } });
      if (!account) {
        account = await this.accounts.save(
          this.accounts.create({ email, googleId: uid }),
        );
      }
      return this.token(account);
    }

    throw new BadRequestException('El token Firebase no contiene email ni teléfono');
  }

  /** Verifica un Firebase phone token y actualiza el teléfono del perfil del usuario autenticado. */
  async updatePhone(accountId: string, idToken: string): Promise<{ phone: string }> {
    let decoded: admin.auth.DecodedIdToken;
    try {
      decoded = await admin.auth().verifyIdToken(idToken);
    } catch {
      throw new BadRequestException('Firebase token inválido');
    }

    const phone = (decoded as any).phone_number;
    if (!phone) throw new BadRequestException('El token no corresponde a autenticación por teléfono');

    await this.dataSource.query(
      `INSERT INTO profiles (id, account_id, phone)
       VALUES (gen_random_uuid(), $1, $2)
       ON CONFLICT (account_id) DO UPDATE SET phone = EXCLUDED.phone`,
      [accountId, phone],
    );

    // También guardar el phone_id en accounts para login futuro por teléfono
    const uid = decoded.uid;
    await this.accounts.update(accountId, { phoneId: uid });

    return { phone };
  }

  async updateProfile(accountId: string, body: { firstName?: string; lastName?: string }) {
    // Ensure the profile row exists
    await this.dataSource.query(
      `INSERT INTO profiles (id, account_id) VALUES (gen_random_uuid(), $1) ON CONFLICT (account_id) DO NOTHING`,
      [accountId],
    );
    if (body.firstName !== undefined) {
      await this.dataSource.query(
        `UPDATE profiles SET first_name = $1 WHERE account_id = $2`,
        [body.firstName, accountId],
      );
    }
    if (body.lastName !== undefined) {
      await this.dataSource.query(
        `UPDATE profiles SET last_name = $1 WHERE account_id = $2`,
        [body.lastName, accountId],
      );
    }
    return {};
  }

  async googleLogin(idToken: string) {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`,
    );
    if (!res.ok) throw new BadRequestException('Token de Google inválido');
    const payload: any = await res.json();
    if (payload.error)
      throw new BadRequestException('Token de Google inválido');

    const { sub: googleId, email } = payload;

    let account = await this.accounts.findOne({ where: { googleId } });
    if (!account) {
      account = await this.accounts.findOne({ where: { email } });
      if (account) {
        await this.accounts.update(account.id, { googleId });
        account.googleId = googleId;
      } else {
        account = await this.accounts.save(
          this.accounts.create({ email, googleId }),
        );
        // Crear perfil y registro en clients para cuentas nuevas de Google
        await this.dataSource.query(
          `INSERT INTO profiles (id, account_id) VALUES (gen_random_uuid(), $1) ON CONFLICT (account_id) DO NOTHING`,
          [account.id],
        );
        await this.dataSource.query(
          `INSERT INTO clients (id, profile_id)
           SELECT gen_random_uuid(), p.id FROM profiles p WHERE p.account_id = $1
           ON CONFLICT (profile_id) DO NOTHING`,
          [account.id],
        );
      }
    }
    return this.token(account);
  }

  /** Devuelve las rutas de frontend permitidas para el usuario (según casbin_rule v4='frontend').
   *  Si el usuario es un sub-admin (staff), filtra por sus granted_permissions en vez de devolver
   *  todas las rutas del rol 'admin'. */
  async getFrontendAccess(
    accountId: string,
    roles: string[],
  ): Promise<string[]> {
    const normalized = roles.map((r) =>
      r === 'super_admin' ? 'superadmin' : r,
    );

    // Si es admin, verificar si es staff (parent_admin_id != NULL)
    if (normalized.includes('admin') && !normalized.includes('superadmin')) {
      const staffRow = await this.dataSource.query(
        `SELECT a.parent_admin_id, a.granted_permissions
         FROM admins a
         INNER JOIN profiles p ON p.id = a.profile_id
         WHERE p.account_id = $1`,
        [accountId],
      );

      if (staffRow.length > 0 && staffRow[0].parent_admin_id !== null) {
        const perms: string[] = staffRow[0].granted_permissions ?? [];
        return this.permissionsToRoutes(perms);
      }
    }

    // Admin raíz o cualquier otro rol: usar reglas Casbin normales
    const rows = await this.dataSource.query(
      `SELECT DISTINCT v1 AS route
       FROM casbin_rule
       WHERE ptype = 'p'
         AND v4    = 'frontend'
         AND v3    = 'allow'
         AND v0    = ANY($1::text[])`,
      [normalized],
    );
    return rows.map((r: { route: string }) => r.route);
  }

  /** Mapea granted_permissions de un staff a las rutas de sidebar que puede ver */
  private permissionsToRoutes(perms: string[]): string[] {
    const routes = new Set<string>();
    routes.add('/dashboard'); // siempre visible

    if (perms.includes('manage_orders') || perms.includes('view_orders')) {
      routes.add('/dashboard/orders');
    }
    if (
      perms.includes('manage_shop') ||
      perms.includes('manage_menu') ||
      perms.includes('manage_schedule')
    ) {
      routes.add('/dashboard/my-shop');
    }
    if (
      perms.includes('manage_shop') ||
      perms.includes('manage_orders') ||
      perms.includes('view_orders')
    ) {
      routes.add('/dashboard/my-shop/income');
      routes.add('/dashboard/my-shop/bank-accounts');
      routes.add('/dashboard/my-shop/withdrawals');
    }
    if (perms.includes('manage_staff')) {
      routes.add('/dashboard/staff');
    }

    return [...routes];
  }

  async me(accountId: string) {
    const account = await this.accounts.findOne({
      where: { id: accountId },
      relations: ['profile'],
    });
    if (!account) throw new UnauthorizedException();
    return {
      id: account.id,
      email: account.email,
      googleId: account.googleId ?? null,
      roles: account.roles,
      firstName: account.profile?.firstName ?? '',
      lastName: account.profile?.lastName ?? '',
      phone: account.profile?.phone ?? '',
      avatarUrl: account.profile?.avatarUrl ?? null,
      createdAt: account.createdAt,
    };
  }
}
