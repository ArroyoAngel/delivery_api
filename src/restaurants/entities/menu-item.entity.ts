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
  size: number; // tamaño físico del producto — lo define el restaurante (1=pequeño, 2=mediano, 3=grande)
}
