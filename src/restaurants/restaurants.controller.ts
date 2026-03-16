import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  Request,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { RestaurantsService } from './restaurants.service';
import { RestaurantStaffService } from './restaurant-staff.service';
import { RestaurantScheduleService } from './restaurant-schedule.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CasbinGuard } from '../authorization/guards/casbin.guard';

@ApiTags('Restaurants')
@Controller('restaurants')
export class RestaurantsController {
  constructor(
    private readonly restaurants: RestaurantsService,
    private readonly staff: RestaurantStaffService,
    private readonly schedule: RestaurantScheduleService,
  ) {}

  // ── Categorías ────────────────────────────────────────────────────────────

  @Get('categories')
  @ApiOperation({ summary: 'Categorías de restaurantes' })
  categories() {
    return this.restaurants.getCategories();
  }

  // ── Listado / detalle ─────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Listar restaurantes' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'categoryId', required: false })
  findAll(
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.restaurants.findAll(search, categoryId);
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard, CasbinGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mi restaurante (admin)' })
  findMine(@Request() req: any) {
    return this.restaurants.findMine(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de restaurante + menú' })
  findOne(@Param('id') id: string) {
    return this.restaurants.findOne(id);
  }

  // ── Actualización del restaurante ─────────────────────────────────────────

  @Patch(':id')
  @UseGuards(JwtAuthGuard, CasbinGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Actualizar datos del restaurante' })
  updateRestaurant(
    @Param('id') id: string,
    @Body() body: any,
    @Request() req: any,
  ) {
    const isSuperAdmin: boolean = req.user.roles?.includes('superadmin');
    return this.restaurants.updateRestaurant(
      id,
      body,
      req.user.id,
      isSuperAdmin,
    );
  }

  // ── Menú ──────────────────────────────────────────────────────────────────

  @Post(':id/menu/categories')
  @UseGuards(JwtAuthGuard, CasbinGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Crear una categoría de menú' })
  createMenuCategory(@Param('id') id: string, @Body() body: any) {
    return this.restaurants.createMenuCategory(id, body);
  }

  @Post(':id/menu')
  @UseGuards(JwtAuthGuard, CasbinGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Registrar un producto en el menú' })
  createMenuItem(@Param('id') id: string, @Body() body: any) {
    return this.restaurants.createMenuItem(id, body);
  }

  @Patch(':id/menu/:itemId')
  @UseGuards(JwtAuthGuard, CasbinGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Actualizar un item del menú (stock, disponibilidad, precio…)',
  })
  updateMenuItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: any,
  ) {
    return this.restaurants.updateMenuItem(id, itemId, body);
  }

  // ── Personal del restaurante ──────────────────────────────────────────────

  @Get(':id/staff')
  @UseGuards(JwtAuthGuard, CasbinGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar personal del restaurante' })
  listStaff(@Param('id') id: string, @Request() req: any) {
    const isSuperAdmin = req.user.roles?.includes('superadmin');
    return this.staff.listStaff(id, req.user.id, isSuperAdmin);
  }

  @Post(':id/staff')
  @UseGuards(JwtAuthGuard, CasbinGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Registrar personal del restaurante',
    description:
      'Crea una cuenta y perfil de staff. Los permisos otorgados deben ser un subconjunto de los permisos del admin solicitante.',
  })
  createStaff(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    const isSuperAdmin = req.user.roles?.includes('superadmin');
    return this.staff.createStaff(id, req.user.id, body, isSuperAdmin);
  }

  @Patch(':id/staff/:staffId')
  @UseGuards(JwtAuthGuard, CasbinGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Actualizar permisos de un miembro del personal' })
  @ApiParam({
    name: 'staffId',
    description: 'ID del registro en tabla admins del staff',
  })
  updateStaffPermissions(
    @Param('id') id: string,
    @Param('staffId') staffId: string,
    @Body() body: { permissions: string[] },
    @Request() req: any,
  ) {
    const isSuperAdmin = req.user.roles?.includes('superadmin');
    return this.staff.updateStaffPermissions(
      id,
      staffId,
      req.user.id,
      body.permissions,
      isSuperAdmin,
    );
  }

  @Delete(':id/staff/:staffId')
  @UseGuards(JwtAuthGuard, CasbinGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remover un miembro del personal del restaurante' })
  removeStaff(
    @Param('id') id: string,
    @Param('staffId') staffId: string,
    @Request() req: any,
  ) {
    const isSuperAdmin = req.user.roles?.includes('superadmin');
    return this.staff.removeStaff(id, staffId, req.user.id, isSuperAdmin);
  }

  // ── Horarios de atención ──────────────────────────────────────────────────

  @Get(':id/schedule')
  @ApiOperation({ summary: 'Obtener horario semanal del restaurante' })
  getSchedule(@Param('id') id: string) {
    return this.schedule.getSchedule(id);
  }

  @Put(':id/schedule')
  @UseGuards(JwtAuthGuard, CasbinGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Definir horario semanal completo',
    description:
      'Reemplaza (upsert) los horarios de los días indicados. ' +
      'day_of_week: 0=Domingo … 6=Sábado. ' +
      'Usar is_closed: true para marcar días sin atención.',
  })
  setSchedule(
    @Param('id') id: string,
    @Body() body: { days: any[] },
    @Request() req: any,
  ) {
    return this.schedule.setSchedule(id, req.user.id, body.days);
  }

  @Patch(':id/schedule/:day')
  @UseGuards(JwtAuthGuard, CasbinGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Actualizar horario de un día específico (0=Dom … 6=Sáb)',
  })
  updateDay(
    @Param('id') id: string,
    @Param('day', ParseIntPipe) day: number,
    @Body() body: any,
    @Request() req: any,
  ) {
    return this.schedule.updateDay(id, day, req.user.id, body);
  }
}
