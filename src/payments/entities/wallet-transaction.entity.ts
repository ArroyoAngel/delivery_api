import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('wallet_transactions')
export class WalletTransactionEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'owner_type' }) ownerType: string;
  @Column({ name: 'owner_id', type: 'uuid' }) ownerId: string;
  @Column({ name: 'payment_id', type: 'uuid', nullable: true }) paymentId: string | null;
  @Column({ name: 'order_id', type: 'uuid', nullable: true }) orderId: string | null;
  @Column({ name: 'group_id', type: 'uuid', nullable: true }) groupId: string | null;
  @Column({ name: 'entry_type' }) entryType: string;
  @Column({ type: 'decimal', precision: 10, scale: 2 }) amount: number;
  @Column({ default: 'pending' }) status: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}