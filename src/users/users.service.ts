import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { AccountEntity } from '../auth/account.entity';
import { ProfileEntity } from '../profiles/profile.entity';
import { ClientEntity } from '../profiles/client.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(AccountEntity)
    private accounts: Repository<AccountEntity>,
    @InjectRepository(ProfileEntity)
    private profiles: Repository<ProfileEntity>,
    @InjectRepository(ClientEntity)
    private clients: Repository<ClientEntity>,
    private dataSource: DataSource,
  ) {}

  async findAll() {
    const all = await this.accounts.find({
      relations: ['profile'],
      order: { createdAt: 'ASC' },
    });
    return all.map((a) => this.toDto(a));
  }

  async updateRoles(id: string, roles: string[]) {
    const account = await this.accounts.findOne({ where: { id }, relations: ['profile'] });
    if (!account) throw new NotFoundException('Usuario no encontrado');

    const hadAdmin = account.roles.includes('admin');
    const losesAdmin = hadAdmin && !roles.includes('admin');

    // Un rider siempre debe tener también el rol client (puede ordenar comida)
    const normalizedRoles = roles.includes('rider') && !roles.includes('client')
      ? [...roles, 'client']
      : roles;

    account.roles = normalizedRoles;
    await this.accounts.save(account);

    // Si se asigna el rol rider, garantizar que exista el registro en clients
    if (normalizedRoles.includes('rider') && account.profile) {
      const existing = await this.clients.findOne({
        where: { profile: { id: account.profile.id } },
      });
      if (!existing) {
        const client = this.clients.create({ profile: account.profile });
        await this.clients.save(client);
      }
    }

    // Cascade: si el dueño pierde el rol 'admin', todos los staff derivados
    // de su perfil admin pierden el rol 'restaurant_staff'.
    if (losesAdmin && account.profile) {
      await this.dataSource.query(
        `UPDATE accounts
         SET roles = array_remove(roles, 'restaurant_staff')
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

  private toDto(a: AccountEntity) {
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
    };
  }
}
