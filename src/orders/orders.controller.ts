import { Controller, Get, Post, Put, Param, Body, UseGuards, Request, Headers, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';

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

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un pedido' })
  findOne(@Request() req, @Param('id') id: string) {
    return this.orders.findOne(req.user.id, id);
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
  @UseGuards(RolesGuard)
  @Roles('restaurant_owner', 'super_admin')
  @ApiOperation({ summary: 'Actualizar estado de pedido — solo restaurant_owner / super_admin' })
  updateStatus(@Param('id') id: string, @Body() body: { status: string }) {
    return this.orders.updateStatus(id, body.status);
  }

  @Get('restaurant/mine')
  @UseGuards(RolesGuard)
  @Roles('restaurant_owner', 'super_admin')
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
