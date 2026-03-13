import {
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ProfileEntity } from './profile.entity';

@Entity('clients')
export class ClientEntity {
  @PrimaryGeneratedColumn('uuid') id: string;

  @OneToOne(() => ProfileEntity, (p) => p.client)
  @JoinColumn({ name: 'profile_id' })
  profile: ProfileEntity;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
