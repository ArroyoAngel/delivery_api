import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('ratings')
export class RatingEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'order_id', type: 'uuid', nullable: true }) orderId:
    | string
    | null;
  @Column({ name: 'group_id', type: 'uuid', nullable: true }) groupId:
    | string
    | null;
  @Column({ name: 'rater_account_id', type: 'uuid' }) raterAccountId: string;
  @Column({ name: 'target_type' }) targetType: string;
  @Column({ name: 'target_account_id', type: 'uuid', nullable: true })
  targetAccountId: string | null;
  @Column({ name: 'target_shop_id', type: 'uuid', nullable: true })
  targetShopId: string | null;
  @Column({ type: 'int' }) score: number;
  @Column({ type: 'text', nullable: true }) comment: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
