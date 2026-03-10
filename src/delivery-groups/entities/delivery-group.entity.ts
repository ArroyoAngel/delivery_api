import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('delivery_groups')
export class DeliveryGroupEntity {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ name: 'rider_id', nullable: true })
  riderId: string;

  @Column({ default: 'available' })
  status: string; // available | assigned | in_progress | completed

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
