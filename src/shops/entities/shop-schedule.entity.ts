import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ShopEntity } from './shop.entity';

/**
 * Horario de atención semanal de un negocio.
 * day_of_week: 0 = Domingo … 6 = Sábado (convención ISO-like usada en JS).
 * Si is_closed = true el negocio no atiende ese día (open_time/close_time ignorados).
 */
@Entity('shop_schedules')
export class ShopScheduleEntity {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ name: 'shop_id' }) shopId: string;

  @ManyToOne(() => ShopEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shop_id' })
  shop: ShopEntity;

  /** 0 = Domingo, 1 = Lunes … 6 = Sábado */
  @Column({ name: 'day_of_week', type: 'smallint' }) dayOfWeek: number;

  @Column({ name: 'open_time', type: 'time', nullable: true }) openTime:
    | string
    | null;

  @Column({ name: 'close_time', type: 'time', nullable: true }) closeTime:
    | string
    | null;

  @Column({ name: 'is_closed', default: false }) isClosed: boolean;
}
