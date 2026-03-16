import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('notifications')
export class NotificationEntity {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ name: 'user_id' }) userId: string;

  @Column() title: string;

  @Column() body: string;

  @Column({ nullable: true }) type: string;

  @Column({ type: 'jsonb', nullable: true }) data: Record<string, unknown>;

  @Column({ name: 'is_read', default: false }) isRead: boolean;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
