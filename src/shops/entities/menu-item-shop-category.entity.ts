import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  JoinColumn,
} from 'typeorm';
import { MenuItemEntity } from './menu-item.entity';
import { ShopCategoryEntity } from './shop-category.entity';

@Entity('menu_item_shop_categories')
export class MenuItemShopCategoryEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'menu_item_id' })
  menuItemId!: string;

  @Column({ name: 'shop_category_id' })
  shopCategoryId!: string;

  @ManyToOne(() => MenuItemEntity)
  @JoinColumn({ name: 'menu_item_id' })
  menuItem!: MenuItemEntity;

  @ManyToOne(() => ShopCategoryEntity, (cat) => cat.menuItemCategories)
  @JoinColumn({ name: 'shop_category_id' })
  shopCategory!: ShopCategoryEntity;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
