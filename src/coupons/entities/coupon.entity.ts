import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('coupons')
export class CouponEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ unique: true }) code: string;
  @Column({ nullable: true }) description: string;
  /** product_pct | product_fixed | delivery_free */
  @Column() type: string;
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 }) value: number;
  /** platform | shop */
  @Column({ name: 'absorbs_cost', default: 'platform' }) absorbsCost: string;
  @Column({ name: 'min_order_amount', type: 'decimal', precision: 10, scale: 2, nullable: true })
  minOrderAmount: number;
  @Column({ name: 'max_uses', nullable: true }) maxUses: number;
  @Column({ name: 'uses_count', default: 0 }) usesCount: number;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @Column({ name: 'expires_at', nullable: true }) expiresAt: Date;
  @Column({ name: 'shop_id', nullable: true }) shopId: string;
  @Column({ name: 'created_by', nullable: true }) createdBy: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
