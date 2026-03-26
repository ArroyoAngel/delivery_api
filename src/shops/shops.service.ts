import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, ILike } from 'typeorm';
import { ShopEntity } from './entities/shop.entity';
import { ShopStaffPermission } from './shop-staff-permission.enum';
import { EventsGateway } from '../events/events.gateway';

@Injectable()
export class ShopsService {
  constructor(
    @InjectRepository(ShopEntity)
    private shops: Repository<ShopEntity>,
    private dataSource: DataSource,
    private events: EventsGateway,
  ) {}

  async findAll(search?: string, categoryId?: string, businessType?: string) {
    const where: any = { isOpen: true };
    if (search) where.name = ILike(`%${search}%`);
    if (categoryId) where.categoryId = categoryId;
    if (businessType) where.businessType = businessType;
    const list = await this.shops.find({
      where,
      order: { rating: 'DESC' },
    });
    return list;
  }

  /**
   * Devuelve el negocio del requester junto con su menú.
   * Funciona para:
   *   - Dueño del negocio (shops.owner_account_id = accountId)
   *   - Staff asignado       (admins.shop_id → negocio)
   */
  async findMine(accountId: string) {
    // 1. Intentar como dueño
    let shop = await this.shops.findOne({
      where: { ownerAccountId: accountId },
    });

    // 2. Intentar como staff asignado
    if (!shop) {
      const [row] = await this.dataSource.query(
        `SELECT a.shop_id
         FROM admins a
         JOIN profiles p ON p.id = a.profile_id
         WHERE p.account_id = $1
           AND a.shop_id IS NOT NULL
         LIMIT 1`,
        [accountId],
      );
      if (row?.shop_id) {
        shop = await this.shops.findOne({
          where: { id: row.shop_id },
        });
      }
    }

    if (!shop)
      throw new NotFoundException('No tenés un negocio asignado');
    return this.attachMenu(shop);
  }

  async findOne(id: string) {
    const shop = await this.shops.findOne({ where: { id } });
    if (!shop) throw new NotFoundException('Negocio no encontrado');
    return this.attachMenu(shop);
  }

  /**
   * Actualiza datos del negocio.
   * - superadmin: puede actualizar cualquier negocio (isSuperAdmin = true).
   * - admin: solo su propio negocio (verifica owner_account_id).
   * - shop_staff: solo su negocio y debe tener MANAGE_SHOP.
   */
  async updateShop(
    id: string,
    dto: Partial<{
      name: string;
      description: string;
      address: string;
      deliveryFee: number;
      deliveryTimeMin: number;
      minimumOrder: number;
      isOpen: boolean;
      openingTime: string;
      closingTime: string;
      status: string;
    }>,
    requesterAccountId?: string,
    isSuperAdmin?: boolean,
  ) {
    const shop = await this.shops.findOne({ where: { id } });
    if (!shop) throw new NotFoundException('Negocio no encontrado');

    if (!isSuperAdmin && requesterAccountId) {
      await this.assertShopAccess(
        id,
        requesterAccountId,
        ShopStaffPermission.MANAGE_SHOP,
      );
    }

    const prevStatus = shop.status;
    Object.assign(shop, dto);
    const saved = await this.shops.save(shop);
    if (dto.status && dto.status !== prevStatus) {
      this.events.emitShopStatusChanged(saved.id, saved.status);
    }
    return saved;
  }

  async updateMenuItem(
    shopId: string,
    itemId: string,
    dto: Partial<{
      name: string;
      description: string;
      price: number;
      isAvailable: boolean;
      stock: number | null;
      dailyLimit: number | null;
    }>,
  ) {
    const [item] = await this.dataSource.query(
      'SELECT * FROM menu_items WHERE id = $1 AND shop_id = $2',
      [itemId, shopId],
    );
    if (!item) throw new NotFoundException('Item no encontrado');
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    if (dto.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(dto.name);
    }
    if (dto.description !== undefined) {
      fields.push(`description = $${idx++}`);
      values.push(dto.description);
    }
    if (dto.price !== undefined) {
      fields.push(`price = $${idx++}`);
      values.push(dto.price);
    }
    if (dto.isAvailable !== undefined) {
      fields.push(`is_available = $${idx++}`);
      values.push(dto.isAvailable);
    }
    if ('stock' in dto) {
      fields.push(`stock = $${idx++}`);
      values.push(dto.stock ?? null);
    }
    if ('dailyLimit' in dto) {
      fields.push(`daily_limit = $${idx++}`);
      values.push(dto.dailyLimit ?? null);
    }
    if (!fields.length) return item;
    values.push(itemId);
    await this.dataSource.query(
      `UPDATE menu_items SET ${fields.join(', ')} WHERE id = $${idx}`,
      values,
    );
    return this.dataSource
      .query('SELECT * FROM menu_items WHERE id = $1', [itemId])
      .then((r) => r[0]);
  }

  async createMenuCategory(
    shopId: string,
    dto: { name: string; sortOrder?: number },
  ) {
    const shop = await this.shops.findOne({
      where: { id: shopId },
    });
    if (!shop) throw new NotFoundException('Negocio no encontrado');
    const [row] = await this.dataSource.query(
      `INSERT INTO menu_categories (shop_id, name, sort_order)
       VALUES ($1, $2, COALESCE($3, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM menu_categories WHERE shop_id = $1)))
       RETURNING id, name, sort_order AS "sortOrder"`,
      [shopId, dto.name, dto.sortOrder ?? null],
    );
    return row;
  }

  async createMenuItem(
    shopId: string,
    dto: {
      categoryId: string;
      name: string;
      description?: string;
      price: number;
      imageUrl?: string;
      isAvailable?: boolean;
      stock?: number | null;
      dailyLimit?: number | null;
      size?: number;
    },
  ) {
    const shop = await this.shops.findOne({
      where: { id: shopId },
    });
    if (!shop) throw new NotFoundException('Negocio no encontrado');
    const [row] = await this.dataSource.query(
      `INSERT INTO menu_items
         (shop_id, category_id, name, description, price, image_url, is_available, stock, daily_limit, daily_sold, size)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, $10)
       RETURNING id, name, description, price, image_url AS "imageUrl",
                 is_available AS "isAvailable", stock, daily_limit AS "dailyLimit",
                 daily_sold AS "dailySold", category_id AS "categoryId", size`,
      [
        shopId,
        dto.categoryId,
        dto.name,
        dto.description ?? '',
        dto.price,
        dto.imageUrl ?? '',
        dto.isAvailable ?? true,
        dto.stock ?? null,
        dto.dailyLimit ?? null,
        dto.size ?? 1,
      ],
    );
    return row;
  }

  async getCategories(businessType?: string) {
    if (businessType) {
      return this.dataSource.query(
        'SELECT * FROM shop_categories WHERE business_type = $1 ORDER BY sort_order',
        [businessType],
      );
    }
    return this.dataSource.query(
      'SELECT * FROM shop_categories ORDER BY business_type, sort_order',
    );
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private async attachMenu(shop: ShopEntity) {
    const menuCategories = await this.dataSource.query(
      `SELECT mc.id, mc.name, mc.sort_order AS "sortOrder",
          json_agg(
            json_build_object(
              'id', mi.id, 'name', mi.name, 'description', mi.description,
              'price', mi.price, 'imageUrl', mi.image_url,
              'isAvailable', mi.is_available, 'stock', mi.stock,
              'dailyLimit', mi.daily_limit, 'dailySold', mi.daily_sold,
              'categoryId', mi.category_id
            ) ORDER BY mi.name
          ) FILTER (WHERE mi.id IS NOT NULL) AS items
       FROM menu_categories mc
       LEFT JOIN menu_items mi ON mi.category_id = mc.id
       WHERE mc.shop_id = $1
       GROUP BY mc.id ORDER BY mc.sort_order`,
      [shop.id],
    );
    return {
      ...shop,
      menuCategories: menuCategories.map((c: any) => ({
        ...c,
        items: c.items ?? [],
      })),
    };
  }

  /**
   * Verifica que el requester sea dueño del negocio O sea staff con el permiso indicado.
   */
  private async assertShopAccess(
    shopId: string,
    accountId: string,
    permission: ShopStaffPermission,
  ) {
    const [isOwner] = await this.dataSource.query(
      'SELECT 1 FROM shops WHERE id = $1 AND owner_account_id = $2',
      [shopId, accountId],
    );
    if (isOwner) return;

    const [isStaff] = await this.dataSource.query(
      `SELECT 1
       FROM admins a
       JOIN profiles p ON p.id = a.profile_id
       WHERE a.shop_id = $1
         AND p.account_id   = $2
         AND $3 = ANY(a.granted_permissions)`,
      [shopId, accountId, permission],
    );
    if (!isStaff) {
      throw new ForbiddenException(
        `No tenés acceso o el permiso "${permission}" en este negocio`,
      );
    }
  }
}
