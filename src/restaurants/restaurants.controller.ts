import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { RestaurantsService } from './restaurants.service';

@ApiTags('Restaurants')
@Controller('restaurants')
export class RestaurantsController {
  constructor(private readonly restaurants: RestaurantsService) {}

  @Get('categories')
  @ApiOperation({ summary: 'Categorías de restaurantes' })
  categories() {
    return this.restaurants.getCategories();
  }

  @Get()
  @ApiOperation({ summary: 'Listar restaurantes' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'categoryId', required: false })
  findAll(@Query('search') search?: string, @Query('categoryId') categoryId?: string) {
    return this.restaurants.findAll(search, categoryId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de restaurante + menú' })
  findOne(@Param('id') id: string) {
    return this.restaurants.findOne(id);
  }
}
