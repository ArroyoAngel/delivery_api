import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import {
  ALL_STAFF_PERMISSIONS,
  ShopStaffPermission,
} from './shop-staff-permission.enum';

/** Nombres de cargo que están reservados para roles del sistema */
const RESERVED_ROLE_NAMES = [
  'administrador',
  'admin',
  'superadmin',
  'superadministrador',
  'super admin',
  'super administrador',
  'dueño',
  'propietario',
  'owner',
  'root',
];

interface CreateStaffDto {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  roleName: string;
  permissions: string[];
}

@Injectable()
export class ShopStaffService {
  constructor(private readonly dataSource: DataSource) {}

  // ── helpers ──────────────────────────────────────────────────────────────

  /**
   * Obtiene el registro admin del requester para este negocio.
   * Funciona tanto para el dueño (shops.owner_account_id) como para staff asignado.
   * Lanza ForbiddenException si no tiene acceso.
   */
  private async getRequesterAdmin(shopId: string, accountId: string) {
    const [row] = await this.dataSource.query(
      `SELECT a.id, a.parent_admin_id, a.granted_permissions
       FROM admins a
       JOIN profiles p ON p.id = a.profile_id
       WHERE p.account_id = $1
         AND (
           -- dueño del negocio (su admin no tiene shop_id pero el negocio lo referencia)
           EXISTS (
             SELECT 1 FROM shops r WHERE r.id = $2 AND r.owner_account_id = $1
           )
           -- staff asignado directamente
           OR a.shop_id = $2
         )`,
      [accountId, shopId],
    );
    if (!row)
      throw new ForbiddenException('No tenés acceso a este negocio');
    return row as {
      id: string;
      parent_admin_id: string | null;
      granted_permissions: string[];
    };
  }

  /**
   * Devuelve los permisos que el requester puede otorgar:
   *   - Admin raíz (parent_admin_id = null) → todos los permisos
   *   - Staff       → solo sus granted_permissions
   */
  private grantablePermissions(admin: {
    parent_admin_id: string | null;
    granted_permissions: string[];
  }): string[] {
    if (admin.parent_admin_id === null) {
      // Root admin: si el superadmin le restringió permisos explícitamente, respetarlos
      return (admin.granted_permissions?.length ?? 0) > 0
        ? admin.granted_permissions
        : [...ALL_STAFF_PERMISSIONS];
    }
    return admin.granted_permissions ?? [];
  }

  private assertCanManageStaff(admin: {
    parent_admin_id: string | null;
    granted_permissions: string[];
  }) {
    const grantable = this.grantablePermissions(admin);
    if (!grantable.includes(ShopStaffPermission.MANAGE_STAFF)) {
      throw new ForbiddenException('No tenés permiso para gestionar personal');
    }
  }

  private assertPermissionsSubset(requested: string[], grantable: string[]) {
    const invalid = requested.filter((p) => !grantable.includes(p));
    if (invalid.length > 0) {
      throw new BadRequestException(
        `No podés otorgar los permisos: ${invalid.join(', ')}`,
      );
    }
  }

  // ── endpoints ─────────────────────────────────────────────────────────────

  async listStaff(
    shopId: string,
    requesterAccountId: string,
    isSuperAdmin = false,
  ) {
    if (!isSuperAdmin) {
      await this.getRequesterAdmin(shopId, requesterAccountId);
    }

    if (isSuperAdmin) {
      // Superadmin ve también al propietario (root admin) para poder editar sus permisos
      return this.dataSource.query(
        `SELECT a.id,
                a.granted_permissions                   AS permissions,
                COALESCE(a.role_name, 'Propietario')    AS "roleName",
                acc.id                                  AS "accountId",
                acc.email,
                p.first_name                            AS "firstName",
                p.last_name                             AS "lastName",
                p.phone,
                a.created_at                            AS "createdAt",
                (a.parent_admin_id IS NULL)             AS "isOwner"
         FROM admins a
         JOIN profiles p   ON p.id   = a.profile_id
         JOIN accounts acc ON acc.id = p.account_id
         WHERE a.shop_id = $1
            OR (
                 a.shop_id IS NULL
                 AND p.account_id IN (
                   SELECT owner_account_id FROM shops WHERE id = $1
                 )
               )
         ORDER BY (a.parent_admin_id IS NULL) DESC, a.created_at ASC`,
        [shopId],
      );
    }

    return this.dataSource.query(
      `SELECT a.id,
              a.granted_permissions       AS permissions,
              a.role_name                 AS "roleName",
              acc.id                      AS "accountId",
              acc.email,
              p.first_name                AS "firstName",
              p.last_name                 AS "lastName",
              p.phone,
              a.created_at                AS "createdAt",
              false                       AS "isOwner"
       FROM admins a
       JOIN profiles p  ON p.id  = a.profile_id
       JOIN accounts acc ON acc.id = p.account_id
       WHERE a.shop_id = $1
       ORDER BY a.created_at ASC`,
      [shopId],
    );
  }

  async createStaff(
    shopId: string,
    requesterAccountId: string,
    dto: CreateStaffDto,
    isSuperAdmin = false,
  ) {
    let parentAdminId: string;
    let grantable: string[];

    if (isSuperAdmin) {
      grantable = [...ALL_STAFF_PERMISSIONS];
      // Parent será el admin raíz del negocio
      const [ownerAdmin] = await this.dataSource.query(
        `SELECT a.id FROM admins a
         JOIN profiles p ON p.id = a.profile_id
         JOIN accounts acc ON acc.id = p.account_id
         JOIN shops r ON r.owner_account_id = acc.id
         WHERE r.id = $1 AND a.shop_id IS NULL AND a.parent_admin_id IS NULL
         LIMIT 1`,
        [shopId],
      );
      if (!ownerAdmin)
        throw new NotFoundException(
          'No se encontró el admin raíz del negocio',
        );
      parentAdminId = ownerAdmin.id;
    } else {
      const requester = await this.getRequesterAdmin(
        shopId,
        requesterAccountId,
      );
      parentAdminId = requester.id;
      // El admin raíz siempre puede crear staff; un sub-admin necesita MANAGE_STAFF
      if (requester.parent_admin_id !== null) {
        this.assertCanManageStaff(requester);
      }
      grantable = this.grantablePermissions(requester);
    }

    this.assertPermissionsSubset(dto.permissions, grantable);

    // Validar que el nombre del cargo no sea una palabra reservada del sistema
    const normalizedRoleName = dto.roleName.toLowerCase().trim();
    if (RESERVED_ROLE_NAMES.includes(normalizedRoleName)) {
      throw new BadRequestException(
        `El cargo "${dto.roleName}" está reservado para roles del sistema. ` +
          `Usá un nombre descriptivo como "Cajero", "Cocina" o "Supervisor".`,
      );
    }

    // Verificar email único
    const [existing] = await this.dataSource.query(
      'SELECT id FROM accounts WHERE email = $1',
      [dto.email],
    );
    if (existing) throw new BadRequestException('El email ya está registrado');

    return this.dataSource.transaction(async (manager) => {
      const plainMode = process.env.AUTH_PLAIN_PASSWORD === 'true';
      const hashed = plainMode
        ? dto.password
        : await bcrypt.hash(dto.password, 10);

      const [account] = await manager.query(
        `INSERT INTO accounts (email, password, roles)
         VALUES ($1, $2, ARRAY['admin'])
         RETURNING id`,
        [dto.email, hashed],
      );

      const [profile] = await manager.query(
        `INSERT INTO profiles (account_id, first_name, last_name, phone)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [account.id, dto.firstName, dto.lastName, dto.phone ?? null],
      );

      const [staffAdmin] = await manager.query(
        `INSERT INTO admins (profile_id, shop_id, parent_admin_id, granted_permissions, role_name)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [
          profile.id,
          shopId,
          parentAdminId,
          dto.permissions,
          dto.roleName,
        ],
      );

      return {
        id: staffAdmin.id,
        accountId: account.id,
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        roleName: dto.roleName,
        shopId,
        permissions: dto.permissions,
      };
    });
  }

  async updateStaffPermissions(
    shopId: string,
    staffAdminId: string,
    requesterAccountId: string,
    permissions: string[],
    isSuperAdmin = false,
  ) {
    if (isSuperAdmin) {
      // Superadmin puede actualizar cualquier admin del negocio (root o sub)
      const [target] = await this.dataSource.query(
        `SELECT a.id, a.parent_admin_id
         FROM admins a
         LEFT JOIN profiles p ON p.id = a.profile_id
         WHERE a.id = $1
           AND (
             a.shop_id = $2
             OR (
               a.shop_id IS NULL
               AND p.account_id IN (
                 SELECT owner_account_id FROM shops WHERE id = $2
               )
             )
           )`,
        [staffAdminId, shopId],
      );
      if (!target)
        throw new NotFoundException('Admin no encontrado en este negocio');

      await this.dataSource.query(
        'UPDATE admins SET granted_permissions = $1 WHERE id = $2',
        [permissions, staffAdminId],
      );

      // Si se actualizan permisos de un root admin, restringir sub-staff al subconjunto nuevo
      if (target.parent_admin_id === null && permissions.length > 0) {
        await this.dataSource.query(
          `UPDATE admins
              SET granted_permissions = (
                    SELECT COALESCE(array_agg(p), '{}')
                    FROM unnest(granted_permissions) AS p
                    WHERE p = ANY($1::text[])
                  )
            WHERE parent_admin_id = $2`,
          [permissions, staffAdminId],
        );
      }

      return { id: staffAdminId, shopId, permissions };
    }

    const requester = await this.getRequesterAdmin(
      shopId,
      requesterAccountId,
    );

    if (requester.parent_admin_id !== null) {
      this.assertCanManageStaff(requester);
    }

    const grantable = this.grantablePermissions(requester);
    this.assertPermissionsSubset(permissions, grantable);

    const [staff] = await this.dataSource.query(
      'SELECT id FROM admins WHERE id = $1 AND shop_id = $2',
      [staffAdminId, shopId],
    );
    if (!staff)
      throw new NotFoundException('Personal no encontrado en este negocio');

    await this.dataSource.query(
      'UPDATE admins SET granted_permissions = $1 WHERE id = $2',
      [permissions, staffAdminId],
    );

    return { id: staffAdminId, shopId, permissions };
  }

  async removeStaff(
    shopId: string,
    staffAdminId: string,
    requesterAccountId: string,
    isSuperAdmin = false,
  ) {
    if (!isSuperAdmin) {
      const requester = await this.getRequesterAdmin(
        shopId,
        requesterAccountId,
      );
      if (requester.parent_admin_id !== null) {
        this.assertCanManageStaff(requester);
      }
    }

    const [staff] = await this.dataSource.query(
      `SELECT a.id, p.account_id AS "accountId"
       FROM admins a
       JOIN profiles p ON p.id = a.profile_id
       WHERE a.id = $1 AND a.shop_id = $2`,
      [staffAdminId, shopId],
    );
    if (!staff)
      throw new NotFoundException('Personal no encontrado en este negocio');

    // Quitar rol shop_staff de su cuenta
    await this.dataSource.query(
      `UPDATE accounts SET roles = array_remove(roles, 'shop_staff') WHERE id = $1`,
      [staff.accountId],
    );

    // Eliminar registro admin (cascade eliminará sub-staff de este)
    await this.dataSource.query('DELETE FROM admins WHERE id = $1', [
      staffAdminId,
    ]);

    return { message: 'Personal removido exitosamente' };
  }
}
