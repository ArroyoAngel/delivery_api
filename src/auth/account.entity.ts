import {
  Column,
  CreateDateColumn,
  Entity,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ProfileEntity } from '../profiles/profile.entity';

@Entity('accounts')
export class AccountEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ unique: true }) email: string;
  @Column({ nullable: true }) password: string;
  @Column({ name: 'google_id', nullable: true }) googleId: string;
  @Column('text', { array: true, default: '{client}' }) roles: string[];
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;

  @OneToOne(() => ProfileEntity, (p) => p.account)
  profile: ProfileEntity;
}
