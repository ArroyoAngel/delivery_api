import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, ILike } from 'typeorm';
import { RestaurantEntity } from './entities/restaurant.entity';
import { RestaurantStaffPermission } from './restaurant-staff-permission.enum';

@Injectable()
export class RestaurantsService {
  constructor(
    @InjectRepository(RestaurantEntity)
    private restaurants: Repository<RestaurantEntity>,
    private dataSource: DataSource,
  ) {}

  async findAll(search?: string, categoryId?: string) {
    const where: any = { isOpen: true };
    if (search) where.name = ILike(`%${search}%`);
    if (categoryId) where.categoryId = categoryId;
    const list = await this.restaurants.find({
      where,
      order: { rating: 'DESC' },
    });
    return list;
  }

  /**
   * Devuelve el restaurante del requester junto con su menú.
   * Funciona para:
   *   - Dueño del restaurante (restaurants.owner_account_id = accountId)
   *   - Staff asignado       (admins.restaurant_id → restaurante)
   */
  async findMine(accountId: string) {
    // 1. Intentar como dueño
    let restaurant = await this.restaurants.findOne({
      where: { ownerAccountId: accountId },
    });

    // 2. Intentar como staff asignado
    if (!restaurant) {
      const [row] = await this.dataSource.query(
        `SELECT a.restaurant_id
         FROM admins a
         JOIN profiles p ON p.id = a.profile_id
         WHERE p.account_id = $1
           AND a.restaurant_id IS NOT NULL
         LIMIT 1`,
        [accountId],
      );
      if (row?.restaurant_id) {
        restaurant = await this.restaurants.findOne({
          where: { id: row.restaurant_id },
        });
      }
    }

    if (!restaurant)
      throw new NotFoundException('No tenés un restaurante asignado');
    return this.attachMenu(restaurant);
  }

  async findOne(id: string) {
    const restaurant = await this.restaurants.findOne({ where: { id } });
    if (!restaurant) throw new NotFoundException('Restaurante no encontrado');
    return this.attachMenu(restaurant);
  }

  /**
   * Actualiza datos del restaurante.
   * - superadmin: puede actualizar cualquier restaurante (isSuperAdmin = true).
   * - admin: solo su propio restaurante (verifica owner_account_id).
   * - restaurant_staff: solo su restaurante y debe tener MANAGE_RESTAURANT.
   */
  async updateRestaurant(
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
    }>,
    requesterAccountId?: string,
    isSuperAdmin?: boolean,
  ) {
    const restaurant = await this.restaurants.findOne({ where: { id } });
    if (!restaurant) throw new NotFoundException('Restaurante no encontrado');

    if (!isSuperAdmin && requesterAccountId) {
      await this.assertRestaurantAccess(
        id,
        requesterAccountId,
        RestaurantStaffPermission.MANAGE_RESTAURANT,
      );
    }

    Object.assign(restaurant, dto);
    return this.restaurants.save(restaurant);
  }

  async updateMenuItem(
    restaurantId: string,
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
      'SELECT * FROM menu_items WHERE id = $1 AND restaurant_id = $2',
      [itemId, restaurantId],
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
    restaurantId: string,
    dto: { name: string; sortOrder?: number },
  ) {
    const restaurant = await this.restaurants.findOne({
      where: { id: restaurantId },
    });
    if (!restaurant) throw new NotFoundException('Restaurante no encontrado');
    const [row] = await this.dataSource.query(
      `INSERT INTO menu_categories (restaurant_id, name, sort_order)
       VALUES ($1, $2, COALESCE($3, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM menu_categories WHERE restaurant_id = $1)))
       RETURNING id, name, sort_order AS "sortOrder"`,
      [restaurantId, dto.name, dto.sortOrder ?? null],
    );
    return row;
  }

  async createMenuItem(
    restaurantId: string,
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
    const restaurant = await this.restaurants.findOne({
      where: { id: restaurantId },
    });
    if (!restaurant) throw new NotFoundException('Restaurante no encontrado');
    const [row] = await this.dataSource.query(
      `INSERT INTO menu_items
         (restaurant_id, category_id, name, description, price, image_url, is_available, stock, daily_limit, daily_sold, size)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, $10)
       RETURNING id, name, description, price, image_url AS "imageUrl",
                 is_available AS "isAvailable", stock, daily_limit AS "dailyLimit",
                 daily_sold AS "dailySold", category_id AS "categoryId", size`,
      [
        restaurantId,
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

  async getCategories() {
    return this.dataSource.query(
      'SELECT * FROM restaurant_categories ORDER BY sort_order',
    );
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private async attachMenu(restaurant: RestaurantEntity) {
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
       WHERE mc.restaurant_id = $1
       GROUP BY mc.id ORDER BY mc.sort_order`,
      [restaurant.id],
    );
    return {
      ...restaurant,
      menuCategories: menuCategories.map((c: any) => ({
        ...c,
        items: c.items ?? [],
      })),
    };
  }

  /**
   * Verifica que el requester sea dueño del restaurante O sea staff con el permiso indicado.
   */
  private async assertRestaurantAccess(
    restaurantId: string,
    accountId: string,
    permission: RestaurantStaffPermission,
  ) {
    const [isOwner] = await this.dataSource.query(
      'SELECT 1 FROM restaurants WHERE id = $1 AND owner_account_id = $2',
      [restaurantId, accountId],
    );
    if (isOwner) return;

    const [isStaff] = await this.dataSource.query(
      `SELECT 1
       FROM admins a
       JOIN profiles p ON p.id = a.profile_id
       WHERE a.restaurant_id = $1
         AND p.account_id   = $2
         AND $3 = ANY(a.granted_permissions)`,
      [restaurantId, accountId, permission],
    );
    if (!isStaff) {
      throw new ForbiddenException(
        `No tenés acceso o el permiso "${permission}" en este restaurante`,
      );
    }
  }
}
