import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { AccountEntity } from './account.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(AccountEntity)
    private accounts: Repository<AccountEntity>,
    private jwt: JwtService,
    private dataSource: DataSource,
  ) {}

  private token(account: AccountEntity) {
    return {
      accessToken: this.jwt.sign({
        sub: account.id,
        email: account.email,
        roles: account.roles,
      }),
    };
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
      perms.includes('manage_restaurant') ||
      perms.includes('manage_menu') ||
      perms.includes('manage_schedule')
    ) {
      routes.add('/dashboard/my-restaurant');
    }
    if (
      perms.includes('manage_restaurant') ||
      perms.includes('manage_orders') ||
      perms.includes('view_orders')
    ) {
      routes.add('/dashboard/my-restaurant/income');
      routes.add('/dashboard/my-restaurant/bank-accounts');
      routes.add('/dashboard/my-restaurant/withdrawals');
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
