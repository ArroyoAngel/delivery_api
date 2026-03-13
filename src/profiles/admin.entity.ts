import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ProfileEntity } from './profile.entity';

/**
 * Perfil de administrador.
 *
 * Dos tipos de admins conviven en esta tabla:
 *  1. Admin de plataforma / dueño de restaurante:
 *       restaurant_id = NULL, parent_admin_id = NULL
 *       Sus restaurantes se ubican via restaurants.owner_account_id
 *
 *  2. Staff del restaurante (sub-admin):
 *       restaurant_id  = id del restaurante al que pertenece
 *       parent_admin_id = id del admin que lo creó
 *       granted_permissions = subconjunto de permisos del padre
 *       Su cuenta tiene role 'restaurant_staff' en accounts.roles[]
 *
 * Cascade: si se remueve el rol 'admin' del dueño, el servicio de usuarios
 * quita 'restaurant_staff' de todos los accounts cuyo admin tenga parent_admin_id
 * apuntando a este admin.
 */
@Entity('admins')
export class AdminEntity {
  @PrimaryGeneratedColumn('uuid') id: string;

  @OneToOne(() => ProfileEntity, (p) => p.admin)
  @JoinColumn({ name: 'profile_id' })
  profile: ProfileEntity;

  /** NULL → admin de plataforma; UUID → scoped al restaurante */
  @Column({ name: 'restaurant_id', type: 'uuid', nullable: true })
  restaurantId: string | null;

  /** NULL → admin raíz; UUID → sub-admin creado por otro admin */
  @Column({ name: 'parent_admin_id', type: 'uuid', nullable: true })
  parentAdminId: string | null;

  @ManyToOne(() => AdminEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'parent_admin_id' })
  parentAdmin: AdminEntity | null;

  /** Permisos otorgados (siempre ⊆ permisos del padre) */
  @Column({ name: 'granted_permissions', type: 'text', array: true, default: [] })
  grantedPermissions: string[];

  /** Nombre del cargo dentro del restaurante (ej: "Cajero", "Cocina"). NULL para admins raíz. */
  @Column({ name: 'role_name', type: 'varchar', length: 100, nullable: true })
  roleName: string | null;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
