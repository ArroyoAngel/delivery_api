import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  JoinColumn,
} from 'typeorm';
import { ShopEntity } from './shop.entity';
import { ShopCategoryEntity } from './shop-category.entity';

@Entity('shop_category_assignments')
export class ShopCategoryAssignmentEntity {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ name: 'shop_id' })
  shopId: string;

  @Column({ name: 'category_id' })
  categoryId: string;

  @ManyToOne(() => ShopEntity, (shop) => shop.categoryAssignments)
  @JoinColumn({ name: 'shop_id' })
  shop: ShopEntity;

  @ManyToOne(() => ShopCategoryEntity, (cat) => cat.shopAssignments)
  @JoinColumn({ name: 'category_id' })
  category: ShopCategoryEntity;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
