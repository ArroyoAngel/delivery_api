import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('menu_items')
export class MenuItemEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'restaurant_id' }) restaurantId: string;
  @Column({ name: 'category_id', nullable: true }) categoryId: string;
  @Column() name: string;
  @Column({ nullable: true }) description: string;
  @Column({ type: 'decimal', precision: 10, scale: 2 }) price: number;
  @Column({ name: 'image_url', nullable: true }) imageUrl: string;
  @Column({ name: 'is_available', default: true }) isAvailable: boolean;
  @Column({ type: 'int', default: 1 })
  size: number; // tamaño físico del producto (1=pequeño, 2=mediano, 3=grande)

  /** Unidades en stock. NULL = ilimitado */
  @Column({ type: 'int', nullable: true, default: null }) stock: number | null;

  /** Límite de ventas diarias. NULL = sin límite */
  @Column({ name: 'daily_limit', type: 'int', nullable: true, default: null }) dailyLimit: number | null;

  /** Unidades vendidas en el día (se resetea cada día) */
  @Column({ name: 'daily_sold', type: 'int', default: 0 }) dailySold: number;
}
