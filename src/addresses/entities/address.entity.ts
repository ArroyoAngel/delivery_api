import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('user_addresses')
export class AddressEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'account_id' }) accountId: string;
  @Column() name: string;
  @Column() street: string;
  @Column({ nullable: true }) number: string;
  @Column({ nullable: true }) floor: string;
  @Column({ nullable: true }) reference: string;
  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true }) latitude: number;
  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true }) longitude: number;
  @Column({ name: 'is_default', default: false }) isDefault: boolean;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
