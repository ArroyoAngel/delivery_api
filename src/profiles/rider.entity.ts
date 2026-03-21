import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ProfileEntity } from './profile.entity';

@Entity('riders')
export class RiderEntity {
  @PrimaryGeneratedColumn('uuid') id: string;

  @OneToOne(() => ProfileEntity, (p) => p.rider)
  @JoinColumn({ name: 'profile_id' })
  profile: ProfileEntity;

  @Column({ name: 'vehicle_type', nullable: true }) vehicleType: string; // moto | bici | auto
  @Column({ name: 'is_available', default: false }) isAvailable: boolean;
  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  lat: number;
  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  lng: number;

  @Column({ name: 'zone_id', type: 'uuid', nullable: true }) zoneId: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
