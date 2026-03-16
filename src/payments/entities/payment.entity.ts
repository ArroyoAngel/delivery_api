import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('payments')
export class PaymentEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ unique: true }) reference: string;
  @Column({ name: 'scope_type' }) scopeType: string;
  @Column({ name: 'order_id', type: 'uuid', nullable: true }) orderId:
    | string
    | null;
  @Column({ name: 'group_id', type: 'uuid', nullable: true }) groupId:
    | string
    | null;
  @Column({ name: 'payer_account_id', type: 'uuid' }) payerAccountId: string;
  @Column({ default: 'pending' }) status: string;
  @Column({ default: 'BOB' }) currency: string;
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  subtotal: number;
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
  @Column({
    name: 'total_amount',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
  })
  totalAmount: number;
  @Column({ name: 'bank_provider', type: 'varchar', nullable: true })
  bankProvider: string | null;
  @Column({ name: 'bank_transaction_id', type: 'varchar', nullable: true })
  bankTransactionId: string | null;
  @Column({ type: 'jsonb', nullable: true }) metadata: Record<
    string,
    unknown
  > | null;
  @CreateDateColumn({ name: 'requested_at' }) requestedAt: Date;
  @Column({ name: 'confirmed_at', type: 'timestamptz', nullable: true })
  confirmedAt: Date | null;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
