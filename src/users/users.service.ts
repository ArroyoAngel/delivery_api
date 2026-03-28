import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { AccountEntity } from '../auth/account.entity';
import { ProfileEntity } from '../profiles/profile.entity';
import { ClientEntity } from '../profiles/client.entity';
import { RiderEntity } from '../profiles/rider.entity';
import { AdminEntity } from '../profiles/admin.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(AccountEntity)
    private accounts: Repository<AccountEntity>,
    @InjectRepository(ProfileEntity)
    private profiles: Repository<ProfileEntity>,
    @InjectRepository(ClientEntity)
    private clients: Repository<ClientEntity>,
    @InjectRepository(RiderEntity)
    private riders: Repository<RiderEntity>,
    @InjectRepository(AdminEntity)
    private admins: Repository<AdminEntity>,
    private dataSource: DataSource,
  ) {}

  /** Lista todos los admins raíz con su negocio asociado (si tienen uno). Sin password. */
  async findAdmins() {
    const rows = await this.dataSource.query(`
      SELECT
        a.id,
        a.email,
        a.roles,
        p.first_name  AS "firstName",
        p.last_name   AS "lastName",
        p.phone,
        adm.started_at AS "startedAt",
        s.id          AS "shopId",
        s.name        AS "shopName"
      FROM accounts a
      LEFT JOIN profiles p   ON p.account_id = a.id
      LEFT JOIN admins adm   ON adm.profile_id = p.id
                             AND adm.parent_admin_id IS NULL
      LEFT JOIN shops s      ON s.owner_account_id = a.id
      WHERE 'admin' = ANY(a.roles)
      ORDER BY p.first_name, p.last_name
    `);
    return rows as {
      id: string;
      email: string;
      roles: string[];
      firstName: string;
      lastName: string;
      phone: string | null;
      startedAt: string | null;
      shopId: string | null;
      shopName: string | null;
    }[];
  }

  async findAll() {
    const all = await this.accounts.find({
      relations: ['profile'],
      order: { createdAt: 'ASC' },
    });

    // Pull rider and admin info in bulk to avoid N+1 queries
    const profileIds = all.map((a) => a.profile?.id).filter(Boolean);
    let riderMap: Record<string, RiderEntity> = {};
    let adminMap: Record<string, AdminEntity> = {};

    if (profileIds.length > 0) {
      const riderList = await this.riders.find({
        where: profileIds.map((id) => ({ profile: { id } })),
        relations: ['profile'],
      });
      riderList.forEach((r) => { riderMap[r.profile.id] = r; });

      const adminList = await this.admins.find({
        where: profileIds.map((id) => ({ profile: { id } })),
        relations: ['profile'],
      });
      adminList.forEach((a) => { adminMap[a.profile.id] = a; });
    }

    return all.map((a) => {
      const rider = a.profile ? riderMap[a.profile.id] : undefined;
      const admin = a.profile ? adminMap[a.profile.id] : undefined;
      return this.toDto(a, rider, admin);
    });
  }

  async updateMyProfile(accountId: string, dto: { phone?: string; firstName?: string; lastName?: string }) {
    const profile = await this.profiles.findOne({ where: { accountId } });
    if (!profile) throw new NotFoundException('Perfil no encontrado');
    if (dto.phone !== undefined) profile.phone = dto.phone;
    if (dto.firstName !== undefined) profile.firstName = dto.firstName;
    if (dto.lastName !== undefined) profile.lastName = dto.lastName;
    await this.profiles.save(profile);
    return { phone: profile.phone, firstName: profile.firstName, lastName: profile.lastName };
  }

  async updateRoles(id: string, roles: string[]) {
    const account = await this.accounts.findOne({
      where: { id },
      relations: ['profile'],
    });
    if (!account) throw new NotFoundException('Usuario no encontrado');

    const hadAdmin = account.roles.includes('admin');
    const losesAdmin = hadAdmin && !roles.includes('admin');
    const hadRider = account.roles.includes('rider');
    const losesRider = hadRider && !roles.includes('rider');

    // Un rider siempre debe tener también el rol client (puede ordenar comida)
    const normalizedRoles =
      roles.includes('rider') && !roles.includes('client')
        ? [...roles, 'client']
        : roles;

    account.roles = normalizedRoles;
    await this.accounts.save(account);

    // Si el usuario pierde el rol rider, marcarlo como no disponible
    if (losesRider && account.profile) {
      await this.dataSource.query(
        `UPDATE riders SET is_available = false WHERE profile_id = $1`,
        [account.profile.id],
      );
    }

    // Si se asigna el rol rider, garantizar que exista el registro en clients y riders
    if (normalizedRoles.includes('rider') && account.profile) {
      const existing = await this.clients.findOne({
        where: { profile: { id: account.profile.id } },
      });
      if (!existing) {
        const client = this.clients.create({ profile: account.profile });
        await this.clients.save(client);
      }
      const existingRider = await this.riders.findOne({
        where: { profile: { id: account.profile.id } },
      });
      if (!existingRider) {
        const rider = this.riders.create({ profile: account.profile });
        await this.riders.save(rider);
      }
    }

    // Si se asigna el rol admin, garantizar que exista el registro en admins
    if (normalizedRoles.includes('admin') && account.profile) {
      const existingAdmin = await this.admins.findOne({
        where: { profile: { id: account.profile.id } },
      });
      if (!existingAdmin) {
        const admin = this.admins.create({ profile: account.profile });
        await this.admins.save(admin);
      }
    }

    // Cascade: si el dueño pierde el rol 'admin', todos los staff derivados
    // de su perfil admin pierden el rol 'shop_staff'.
    if (losesAdmin && account.profile) {
      await this.dataSource.query(
        `UPDATE accounts
         SET roles = array_remove(roles, 'shop_staff')
         WHERE id IN (
           SELECT p.account_id
           FROM admins staff_admin
           JOIN profiles p ON p.id = staff_admin.profile_id
           WHERE staff_admin.parent_admin_id IN (
             SELECT root_admin.id
             FROM admins root_admin
             WHERE root_admin.profile_id = $1
           )
         )`,
        [account.profile.id],
      );
    }

    return this.toDto(account);
  }

  async createAdminUser(dto: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
    startedAt?: string;
  }) {
    const exists = await this.accounts.findOne({ where: { email: dto.email } });
    if (exists) throw new ConflictException('El email ya está registrado');

    const account = await this.accounts.save(
      this.accounts.create({ email: dto.email, password: dto.password, roles: ['admin', 'client'] }),
    );

    const profile = await this.profiles.save(
      this.profiles.create({
        accountId: account.id,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
      }),
    );

    const admin = this.admins.create({ profile });
    if (dto.startedAt) admin.startedAt = dto.startedAt;
    await this.admins.save(admin);

    const client = this.clients.create({ profile });
    await this.clients.save(client);

    return this.toDto(account, undefined, admin);
  }

  async updateRiderInfo(
    id: string,
    dto: {
      vehicleType?: string | null;
      licenseFrontUrl?: string | null;
      licenseBackUrl?: string | null;
      plate?: string | null;
      policyUrl?: string | null;
      vin?: string | null;
    },
  ) {
    const account = await this.accounts.findOne({ where: { id }, relations: ['profile'] });
    if (!account) throw new NotFoundException('Usuario no encontrado');

    // Si el account existe pero no tiene profile todavía, crearlo
    if (!account.profile) {
      account.profile = await this.profiles.save(
        this.profiles.create({ accountId: id }),
      );
    }

    let rider = await this.riders.findOne({ where: { profile: { id: account.profile.id } } });
    if (!rider) {
      rider = this.riders.create({ profile: account.profile });
    }

    if (dto.vehicleType !== undefined) rider.vehicleType = dto.vehicleType;
    if (dto.licenseFrontUrl !== undefined) rider.licenseFrontUrl = dto.licenseFrontUrl;
    if (dto.licenseBackUrl !== undefined) rider.licenseBackUrl = dto.licenseBackUrl;
    if (dto.plate !== undefined) rider.plate = dto.plate;
    if (dto.policyUrl !== undefined) rider.policyUrl = dto.policyUrl;
    if (dto.vin !== undefined) rider.vin = dto.vin;

    await this.riders.save(rider);
    return {
      vehicleType: rider.vehicleType,
      licenseFrontUrl: rider.licenseFrontUrl,
      licenseBackUrl: rider.licenseBackUrl,
      plate: rider.plate,
      policyUrl: rider.policyUrl,
      vin: rider.vin,
    };
  }

  async updateAdminInfo(id: string, dto: { startedAt?: string | null }) {
    const account = await this.accounts.findOne({ where: { id }, relations: ['profile'] });
    if (!account?.profile) throw new NotFoundException('Usuario no encontrado');

    let admin = await this.admins.findOne({ where: { profile: { id: account.profile.id } } });
    if (!admin) {
      admin = this.admins.create({ profile: account.profile });
    }

    if (dto.startedAt !== undefined) admin.startedAt = dto.startedAt;

    await this.admins.save(admin);
    return { startedAt: admin.startedAt };
  }

  private toDto(a: AccountEntity, rider?: RiderEntity, admin?: AdminEntity) {
    return {
      id: a.id,
      email: a.email,
      googleId: a.googleId ?? null,
      roles: a.roles,
      firstName: a.profile?.firstName ?? '',
      lastName: a.profile?.lastName ?? '',
      phone: a.profile?.phone ?? '',
      avatarUrl: a.profile?.avatarUrl ?? null,
      createdAt: a.createdAt,
      riderInfo: rider ? {
        vehicleType: rider.vehicleType,
        licenseFrontUrl: rider.licenseFrontUrl,
        licenseBackUrl: rider.licenseBackUrl,
        plate: rider.plate,
        policyUrl: rider.policyUrl,
        vin: rider.vin,
      } : null,
      adminInfo: admin ? {
        startedAt: admin.startedAt,
      } : null,
    };
  }
}
