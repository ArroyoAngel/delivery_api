import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('withdrawal_requests')
export class WithdrawalRequestEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'owner_type' }) ownerType: string;
  @Column({ name: 'restaurant_id', type: 'uuid', nullable: true }) restaurantId: string | null;
  @Column({ name: 'rider_id', type: 'uuid', nullable: true }) riderId: string | null;
  @Column({ type: 'decimal', precision: 10, scale: 2 }) amount: number;
  @Column({ default: 'pending' }) status: string;
  @Column({ name: 'restaurant_bank_account_id', type: 'uuid', nullable: true }) restaurantBankAccountId: string | null;
  @Column({ name: 'rider_bank_account_id', type: 'uuid', nullable: true }) riderBankAccountId: string | null;
  @Column({ name: 'external_transfer_id', type: 'varchar', nullable: true }) externalTransferId: string | null;
  @Column({ type: 'text', nullable: true }) notes: string | null;
  @CreateDateColumn({ name: 'requested_at' }) requestedAt: Date;
  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true }) processedAt: Date | null;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}