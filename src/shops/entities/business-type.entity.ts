import { Column, Entity, OneToMany, PrimaryColumn } from 'typeorm';
import { ShopCategoryEntity } from './shop-category.entity';

@Entity('business_types')
export class BusinessTypeEntity {
  /** Código en inglés, usado como PK */
  @PrimaryColumn({ type: 'varchar' }) value: string;

  @OneToMany(() => ShopCategoryEntity, (cat) => cat.businessType)
  categories: ShopCategoryEntity[];

  /** Etiqueta para mostrar en el UI */
  @Column({ type: 'varchar' }) label: string;

  @Column({ name: 'sort_order', default: 0 }) sortOrder: number;

  /** Categoría de servicio: food | market | health */
  @Column({ name: 'service_category', type: 'varchar', default: 'food' })
  serviceCategory: string;

  /** Nombre del icono de Flutter (Icons.xxx) */
  @Column({ name: 'flutter_icon', type: 'varchar', nullable: true })
  flutterIcon: string | null;

  /** Color de fondo en hex (#RRGGBB) */
  @Column({ name: 'bg_color', type: 'varchar', nullable: true })
  bgColor: string | null;

  /** Color del icono en hex (#RRGGBB) */
  @Column({ name: 'icon_color', type: 'varchar', nullable: true })
  iconColor: string | null;

  /** Nombre del icono para web (lucide-react) */
  @Column({ name: 'web_icon', type: 'varchar', nullable: true })
  webIcon: string | null;
}
