import { Controller, Get, Post, Put, Param, Body, UseGuards, Request, Headers, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CasbinGuard } from '../authorization/guards/casbin.guard';

@ApiTags('Orders')
@Controller('orders')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

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

  @Post(':id/pay')
  @ApiOperation({ summary: 'Confirmar pago (webhook BNB / Postman)' })
  confirmPayment(
    @Param('id') id: string,
    @Headers('x-payment-secret') secret: string,
    @Body() body: { reference?: string; paidAmount?: number },
  ) {
    const expected = process.env.PAYMENT_WEBHOOK_SECRET ?? 'webhook_secret_dev_2024';
    if (secret !== expected) throw new UnauthorizedException('Secret de pago inválido');
    return this.orders.confirmPayment(id, body?.paidAmount);
  }
}
