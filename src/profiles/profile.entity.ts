import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AccountEntity } from '../auth/account.entity';
import { ClientEntity } from './client.entity';
import { RiderEntity } from './rider.entity';
import { AdminEntity } from './admin.entity';

@Entity('profiles')
export class ProfileEntity {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ name: 'account_id', unique: true })
  accountId: string;

  @OneToOne(() => AccountEntity, (a) => a.profile)
  @JoinColumn({ name: 'account_id' })
  account: AccountEntity;

  @Column({ name: 'first_name', nullable: true }) firstName: string;
  @Column({ name: 'last_name', nullable: true }) lastName: string;
  @Column({ nullable: true }) phone: string;
  @Column({ name: 'avatar_url', nullable: true }) avatarUrl: string;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;

  @OneToOne(() => ClientEntity, (c) => c.profile)
  client: ClientEntity;

  @OneToOne(() => RiderEntity, (r) => r.profile)
  rider: RiderEntity;

  @OneToOne(() => AdminEntity, (a) => a.profile)
  admin: AdminEntity;
}
