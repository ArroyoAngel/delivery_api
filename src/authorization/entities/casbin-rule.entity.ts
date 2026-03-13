import { BaseEntity, Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Entidad que mapea la tabla casbin_rule gestionada por typeorm-adapter.
 * Se usa en seeds para insertar políticas de acceso directamente.
 */
@Entity('casbin_rule')
export class CasbinRuleEntity extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true, type: 'varchar' })
  ptype: string | null;

  /** rol / sujeto */
  @Column({ nullable: true, type: 'varchar' })
  v0: string | null;

  /** ruta / recurso */
  @Column({ nullable: true, type: 'varchar' })
  v1: string | null;

  /** acción (GET|POST|…) */
  @Column({ nullable: true, type: 'varchar' })
  v2: string | null;

  /** efecto (allow / deny) */
  @Column({ nullable: true, type: 'varchar' })
  v3: string | null;

  /** tipo (backend / frontend) */
  @Column({ nullable: true, type: 'varchar' })
  v4: string | null;

  @Column({ nullable: true, type: 'varchar' })
  v5: string | null;

  constructor(data?: Partial<CasbinRuleEntity>) {
    super();
    if (data) Object.assign(this, data);
  }
}
