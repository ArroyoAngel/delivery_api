import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('orders')
export class OrderEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'client_id' }) clientId: string;
  @Column({ name: 'shop_id' }) shopId: string;
  @Column({ name: 'rider_id', nullable: true }) riderId: string;
  @Column({ default: 'pendiente' }) status: string;
  @Column({ name: 'delivery_type', default: 'delivery' }) deliveryType: string;
  @Column({ name: 'delivery_address', nullable: true }) deliveryAddress: string;
  @Column({
    name: 'delivery_lat',
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
  })
  deliveryLat: number;
  @Column({
    name: 'delivery_lng',
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
  })
  deliveryLng: number;
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  subtotal: number;
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  total: number;
  @Column({
    name: 'delivery_fee',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
  })
  deliveryFee: number;
  @Column({
    name: 'platform_fee',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
  })
  platformFee: number;
  @Column({ name: 'payment_reference', nullable: true, unique: true })
  paymentReference: string;
  @Column({ nullable: true }) notes: string;
  @Column({ name: 'group_id', nullable: true }) groupId: string;
  @Column({
    name: 'commission_amount',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
  })
  commissionAmount: number;
  @Column({ name: 'order_size', type: 'int', default: 0 }) orderSize: number;
  @Column({ name: 'coupon_code', nullable: true }) couponCode: string;
  @Column({ name: 'coupon_discount', type: 'decimal', precision: 10, scale: 2, default: 0 })
  couponDiscount: number;
  @Column({ name: 'coupon_absorbs', nullable: true }) couponAbsorbs: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
