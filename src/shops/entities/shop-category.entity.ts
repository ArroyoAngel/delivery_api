import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  JoinColumn,
} from 'typeorm';
import { BusinessTypeEntity } from './business-type.entity';
import { MenuItemShopCategoryEntity } from './menu-item-shop-category.entity';

@Entity('shop_categories')
export class ShopCategoryEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column() name!: string;

  @Column({ nullable: true }) icon!: string;

  @Column({ name: 'sort_order', default: 0 }) sortOrder!: number;

  @Column({ name: 'business_type_id' })
  businessTypeId!: string;

  @ManyToOne(() => BusinessTypeEntity, (bt) => bt.categories)
  @JoinColumn({ name: 'business_type_id' })
  businessType!: BusinessTypeEntity;

  @OneToMany(() => MenuItemShopCategoryEntity, (assign) => assign.shopCategory)
  menuItemCategories!: MenuItemShopCategoryEntity[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
