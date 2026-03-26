import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('shops')
export class ShopEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'owner_account_id', nullable: true }) ownerAccountId: string;
  @Column() name: string;
  @Column({ nullable: true }) description: string;
  @Column() address: string;
  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude: number;
  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude: number;
  @Column({ name: 'category_id', nullable: true }) categoryId: string;
  @Column({ name: 'image_url', nullable: true }) imageUrl: string;
  @Column({ type: 'decimal', precision: 2, scale: 1, default: 0 })
  rating: number;
  @Column({ name: 'delivery_time_min', default: 30 }) deliveryTimeMin: number;
  @Column({
    name: 'delivery_fee',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
  })
  deliveryFee: number;
  @Column({
    name: 'minimum_order',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
  })
  minimumOrder: number;
  @Column({ name: 'is_open', default: true }) isOpen: boolean;
  @Column({ name: 'opening_time', type: 'time', nullable: true, default: null })
  openingTime: string | null;
  @Column({ name: 'closing_time', type: 'time', nullable: true, default: null })
  closingTime: string | null;
  @Column({ name: 'business_type', default: 'restaurant' }) businessType: string;
  @Column({ name: 'zone_id', type: 'uuid', nullable: true }) zoneId: string | null;
  @Column({ default: 'active' }) status: string; // 'active' | 'disabled'
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
