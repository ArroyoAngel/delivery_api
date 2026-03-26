import { Column, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('rider_credits')
export class RiderCreditsEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'rider_id', unique: true }) riderId: string;
  @Column({ type: 'int', default: 0 }) balance: number;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
