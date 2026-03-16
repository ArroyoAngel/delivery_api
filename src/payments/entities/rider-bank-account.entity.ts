import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('rider_bank_accounts')
export class RiderBankAccountEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'rider_id', type: 'uuid' }) riderId: string;
  @Column({ name: 'bank_name' }) bankName: string;
  @Column({ name: 'account_holder' }) accountHolder: string;
  @Column({ name: 'account_number' }) accountNumber: string;
  @Column({ name: 'account_type', type: 'varchar', nullable: true })
  accountType: string | null;
  @Column({ name: 'branch_name', type: 'varchar', nullable: true }) branchName:
    | string
    | null;
  @Column({ default: 'BOB' }) currency: string;
  @Column({ name: 'is_default', default: false }) isDefault: boolean;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
