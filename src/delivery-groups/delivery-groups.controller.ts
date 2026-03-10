import { Controller, Get, Post, Put, Param, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { DeliveryGroupsService } from './delivery-groups.service';

@ApiTags('Rider')
@Controller('rider')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class DeliveryGroupsController {
  constructor(private readonly service: DeliveryGroupsService) {}

  @Get('groups/available')
  @Roles('rider')
  @ApiOperation({ summary: 'Grupos de pedidos disponibles para aceptar' })
  available() {
    return this.service.getAvailableGroups();
  }

  @Get('groups/my-active')
  @Roles('rider')
  @ApiOperation({ summary: 'Mi entrega activa' })
  myActive(@Request() req) {
    return this.service.getMyActiveGroup(req.user.id);
  }

  @Post('groups/:id/accept')
  @Roles('rider')
  @ApiOperation({ summary: 'Aceptar un grupo de pedidos' })
  accept(@Request() req, @Param('id') id: string) {
    return this.service.acceptGroup(req.user.id, id);
  }

  @Put('orders/:orderId/delivered')
  @Roles('rider')
  @ApiOperation({ summary: 'Marcar un pedido como entregado' })
  markDelivered(@Request() req, @Param('orderId') orderId: string) {
    return this.service.markOrderDelivered(req.user.id, orderId);
  }

  // Endpoint para que el restaurante marque el pedido como 'listo' y dispare el agrupamiento
  @Put('orders/:orderId/ready')
  @Roles('restaurant_owner')
  @ApiOperation({ summary: 'Restaurante marca pedido listo para recoger — dispara agrupamiento' })
  async markReady(@Param('orderId') orderId: string) {
    // Delegamos al orders service via dataSource — pero aquí hacemos update directo + trigger
    const result = await this.service.markOrderReady(orderId);
    return result;
  }
}
