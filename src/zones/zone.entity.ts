import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('delivery_zones')
export class DeliveryZoneEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() name: string;
  @Column() city: string;
  @Column({ name: 'center_lat', type: 'decimal', precision: 10, scale: 7 }) centerLat: number;
  @Column({ name: 'center_lng', type: 'decimal', precision: 10, scale: 7 }) centerLng: number;
  @Column({ name: 'radius_meters', default: 5000 }) radiusMeters: number;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
