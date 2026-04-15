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
import { ShopCategoryAssignmentEntity } from './shop-category-assignment.entity';

@Entity('shop_categories')
export class ShopCategoryEntity {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column() name: string;

  @Column({ nullable: true }) icon: string;

  @Column({ name: 'sort_order', default: 0 }) sortOrder: number;

  @Column({ name: 'business_type_id' })
  businessTypeId: string;

  @ManyToOne(() => BusinessTypeEntity, (bt) => bt.categories)
  @JoinColumn({ name: 'business_type_id' })
  businessType: BusinessTypeEntity;

  @OneToMany(() => ShopCategoryAssignmentEntity, (assign) => assign.category)
  shopAssignments: ShopCategoryAssignmentEntity[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
