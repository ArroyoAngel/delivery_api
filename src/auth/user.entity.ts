import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ unique: true }) email: string;
  @Column({ nullable: true }) password: string;
  @Column({ name: 'first_name', nullable: true }) firstName: string;
  @Column({ name: 'last_name', nullable: true }) lastName: string;
  @Column({ nullable: true }) phone: string;
  @Column('text', { array: true, default: '{client}' }) roles: string[];
  @Column({ name: 'google_id', nullable: true }) googleId: string;
  @Column({ name: 'avatar_url', nullable: true }) avatarUrl: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
