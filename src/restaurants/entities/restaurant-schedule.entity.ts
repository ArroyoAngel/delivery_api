import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { RestaurantEntity } from './restaurant.entity';

/**
 * Horario de atención semanal de un restaurante.
 * day_of_week: 0 = Domingo … 6 = Sábado (convención ISO-like usada en JS).
 * Si is_closed = true el restaurante no atiende ese día (open_time/close_time ignorados).
 */
@Entity('restaurant_schedules')
export class RestaurantScheduleEntity {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ name: 'restaurant_id' }) restaurantId: string;

  @ManyToOne(() => RestaurantEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'restaurant_id' })
  restaurant: RestaurantEntity;

  /** 0 = Domingo, 1 = Lunes … 6 = Sábado */
  @Column({ name: 'day_of_week', type: 'smallint' }) dayOfWeek: number;

  @Column({ name: 'open_time', type: 'time', nullable: true }) openTime: string | null;

  @Column({ name: 'close_time', type: 'time', nullable: true }) closeTime: string | null;

  @Column({ name: 'is_closed', default: false }) isClosed: boolean;
}
