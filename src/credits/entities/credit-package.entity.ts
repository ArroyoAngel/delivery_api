import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('credit_packages')
export class CreditPackageEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() name: string;
  @Column({ type: 'int' }) credits: number;
  @Column({ name: 'bonus_credits', type: 'int', default: 0 }) bonusCredits: number;
  @Column({ type: 'decimal', precision: 10, scale: 2 }) price: number;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @Column({ name: 'sort_order', type: 'int', default: 0 }) sortOrder: number;
  @Column({ name: 'qr_data', type: 'text', nullable: true }) qrData: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
