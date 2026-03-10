import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, ILike } from 'typeorm';
import { RestaurantEntity } from './entities/restaurant.entity';

@Injectable()
export class RestaurantsService {
  constructor(
    @InjectRepository(RestaurantEntity) private restaurants: Repository<RestaurantEntity>,
    private dataSource: DataSource,
  ) {}

  async findAll(search?: string, categoryId?: string) {
    const where: any = { isOpen: true };
    if (search) where.name = ILike(`%${search}%`);
    if (categoryId) where.categoryId = categoryId;
    const list = await this.restaurants.find({ where, order: { rating: 'DESC' } });
    return list;
  }

  async findOne(id: string) {
    const restaurant = await this.restaurants.findOne({ where: { id } });
    if (!restaurant) throw new NotFoundException('Restaurante no encontrado');
    const menu = await this.dataSource.query(
      `SELECT mi.*, mc.name AS category_name
       FROM menu_items mi
       LEFT JOIN menu_categories mc ON mc.id = mi.category_id
       WHERE mi.restaurant_id = $1 AND mi.is_available = true
       ORDER BY mc.sort_order, mi.name`,
      [id],
    );
    return { ...restaurant, menu };
  }

  async getCategories() {
    return this.dataSource.query('SELECT * FROM restaurant_categories ORDER BY sort_order');
  }
}
