import { Controller, Get, Post, Put, Param, Body, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import {
  CreateOrderDto,
  ExpressCheckoutDto,
  CreateRestaurantLocalOrderDto,
  CreateRestaurantServiceAreaDto,
} from './dto/create-order.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CasbinGuard } from '../authorization/guards/casbin.guard';
import { DeliveryGroupsService } from '../delivery-groups/delivery-groups.service';

@ApiTags('Orders')
@Controller('orders')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly groups: DeliveryGroupsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Mis pedidos' })
  myOrders(@Request() req) {
    return this.orders.findMyOrders(req.user.id);
  }

  @Get('admin/all')
  @UseGuards(CasbinGuard)
  @ApiOperation({ summary: 'Todos los pedidos — superadmin/admin' })
  allOrders() {
    return this.orders.findAllOrders();
  }

  @Get('admin/stats')
  @UseGuards(CasbinGuard)
  @ApiOperation({ summary: 'Estadísticas globales — solo superadmin' })
  adminStats() {
    return this.orders.getAdminStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un pedido' })
  findOne(@Request() req, @Param('id') id: string) {
    return this.orders.findOne(req.user.id, id, req.user.roles ?? []);
  }

  @Post()
  @ApiOperation({ summary: 'Crear pedido' })
  create(@Request() req, @Body() dto: CreateOrderDto) {
    return this.orders.create(req.user.id, dto);
  }

  @Post('express-checkout')
  @ApiOperation({ summary: 'Checkout express multi-restaurante — crea un grupo de entrega inmediato' })
  expressCheckout(@Request() req, @Body() dto: ExpressCheckoutDto) {
    return this.orders.expressCheckout(req.user.id, dto);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancelar pedido' })
  cancel(@Request() req, @Param('id') id: string) {
    return this.orders.cancelOrder(req.user.id, id);
  }

  @Put(':id/status')
  @UseGuards(CasbinGuard)
  @ApiOperation({ summary: 'Actualizar estado de pedido — solo admin / superadmin' })
  updateStatus(@Param('id') id: string, @Body() body: { status: string }) {
    return this.orders.updateStatus(id, body.status);
  }

  @Get('restaurant/mine')
  @UseGuards(CasbinGuard)
  @ApiOperation({ summary: 'Pedidos de mi restaurante' })
  restaurantOrders(@Request() req) {
    return this.orders.findRestaurantOrders(req.user.id);
  }

  @Get('restaurant/local/areas')
  @UseGuards(CasbinGuard)
  @ApiOperation({ summary: 'Áreas/mesas para servicio en local' })
  restaurantLocalAreas(@Request() req) {
    return this.orders.getRestaurantServiceAreas(req.user.id);
  }

  @Post('restaurant/local/areas')
  @UseGuards(CasbinGuard)
  @ApiOperation({ summary: 'Crear área/mesa para servicio en local' })
  createRestaurantLocalArea(@Request() req, @Body() dto: CreateRestaurantServiceAreaDto) {
    return this.orders.createRestaurantServiceArea(req.user.id, dto);
  }

  @Post('restaurant/local/cash')
  @UseGuards(CasbinGuard)
  @ApiOperation({ summary: 'Registrar orden local/recogida pagada en efectivo (estado confirmado)' })
  createRestaurantLocalCashOrder(@Request() req, @Body() dto: CreateRestaurantLocalOrderDto) {
    return this.orders.createRestaurantLocalCashOrder(req.user.id, dto);
  }

  // ── Estado: confirmado → preparando (admin/restaurante) ──────────────────
  @Put(':id/preparing')
  @UseGuards(CasbinGuard)
  @ApiOperation({ summary: 'Marcar pedido en preparación — admin' })
  markPreparing(@Request() req: any, @Param('id') id: string) {
    return this.groups.markOrderPreparing(id, req.user.id);
  }

  // ── Estado: preparando → listo (admin/restaurante) ───────────────────────
  @Put(':id/ready')
  @UseGuards(CasbinGuard)
  @ApiOperation({ summary: 'Marcar pedido listo para recoger — admin' })
  markReady(@Request() req: any, @Param('id') id: string) {
    return this.groups.markOrderReady(id, req.user.id);
  }

  // ── Estado: listo → en_camino (rider recogió del restaurante) ────────────
  @Put(':id/on-the-way')
  @UseGuards(CasbinGuard)
  @ApiOperation({ summary: 'Confirmar recogida del restaurante — rider' })
  markOnTheWay(@Request() req: any, @Param('id') id: string) {
    return this.groups.markOrderPickedUp(req.user.id, id);
  }

  // ── Estado: en_camino → entregado (rider entregó al cliente) ─────────────
  @Put(':id/done')
  @UseGuards(CasbinGuard)
  @ApiOperation({ summary: 'Confirmar entrega al cliente — rider' })
  markDone(@Request() req: any, @Param('id') id: string) {
    return this.groups.markOrderDelivered(req.user.id, id);
  }

}
