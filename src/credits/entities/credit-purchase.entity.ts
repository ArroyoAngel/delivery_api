import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('credit_purchases')
export class CreditPurchaseEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'rider_id' }) riderId: string;
  @Column({ name: 'package_id' }) packageId: string;
  @Column({ name: 'credits_granted', type: 'int' }) creditsGranted: number;
  @Column({ name: 'amount_paid', type: 'decimal', precision: 10, scale: 2 }) amountPaid: number;
  @Column({ name: 'payment_reference', unique: true }) paymentReference: string;
  @Column({ default: 'pending' }) status: string; // 'pending' | 'confirmed' | 'cancelled' | 'expired'
  @Column({ name: 'bnb_qr_id', type: 'varchar', length: 128, nullable: true }) bnbQrId: string | null;
  @Column({ name: 'bnb_qr_image', type: 'text', nullable: true }) bnbQrImage: string | null;
  @Column({ name: 'proof_image_url', type: 'text', nullable: true }) proofImageUrl: string | null;
  @Column({ name: 'rejection_reason', type: 'text', nullable: true }) rejectionReason: string | null;
  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true }) cancelledAt: Date | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
