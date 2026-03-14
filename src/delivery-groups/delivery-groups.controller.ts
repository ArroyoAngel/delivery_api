import { Controller, Get, Post, Put, Param, Query, Body, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CasbinGuard } from '../authorization/guards/casbin.guard';
import { DeliveryGroupsService } from './delivery-groups.service';

@ApiTags('Rider')
@Controller('rider')
@UseGuards(JwtAuthGuard, CasbinGuard)
@ApiBearerAuth()
export class DeliveryGroupsController {
  constructor(private readonly service: DeliveryGroupsService) {}

  @Get('list')
  @ApiOperation({ summary: 'Lista completa de repartidores con info de perfil' })
  allRiders() {
    return this.service.getAllRiders();
  }

  @Get('location/config')
  @ApiOperation({ summary: 'Configuración de tracking GPS: intervalo actual en segundos' })
  locationConfig() {
    return this.service.getLocationIntervalSeconds().then((s) => ({ intervalSeconds: s }));
  }

  @Post('location/batch')
  @ApiOperation({ summary: 'Sube un segmento de ruta GPS como "lat,lng;lat,lng;..." con el intervalo usado' })
  locationBatch(
    @Request() req: any,
    @Body() body: { path: string; startedAt: string; endedAt: string; intervalSeconds: number },
  ) {
    return this.service.saveLocationSegment(
      req.user.id,
      body.path,
      body.startedAt,
      body.endedAt,
      body.intervalSeconds ?? 5,
    );
  }

  @Get(':id/location-history/dates')
  @ApiOperation({ summary: 'Fechas disponibles en el historial de un repartidor' })
  locationHistoryDates(@Param('id') id: string) {
    return this.service.getRiderLocationDates(id);
  }

  @Get(':id/location-history')
  @ApiOperation({ summary: 'Historial de ubicación de un repartidor por fecha' })
  locationHistory(@Param('id') id: string, @Query('date') date: string) {
    return this.service.getRiderLocationHistory(id, date);
  }

  @Get(':id/deliveries')
  @ApiOperation({ summary: 'Pedidos entregados por un repartidor' })
  riderDeliveries(@Param('id') id: string, @Query('date') date?: string) {
    return this.service.getRiderDeliveries(id, date);
  }

  @Get('groups/available')
  @ApiOperation({ summary: 'Grupos de pedidos disponibles para aceptar' })
  available() {
    return this.service.getAvailableGroups();
  }

  @Get('groups/my-active')
  @ApiOperation({ summary: 'Mi entrega activa' })
  myActive(@Request() req) {
    return this.service.getMyActiveGroup(req.user.id);
  }

  @Post('groups/:id/accept')
  @ApiOperation({ summary: 'Aceptar un grupo de pedidos' })
  accept(@Request() req, @Param('id') id: string) {
    return this.service.acceptGroup(req.user.id, id);
  }

  @Put('orders/:orderId/pickup')
  @ApiOperation({ summary: 'Marcar pedido como recogido del restaurante (aceptado → en_camino)' })
  markPickedUp(@Request() req: any, @Param('orderId') orderId: string) {
    return this.service.markOrderPickedUp(req.user.id, orderId);
  }

  @Put('orders/:orderId/delivered')
  @ApiOperation({ summary: 'Marcar un pedido como entregado' })
  markDelivered(@Request() req, @Param('orderId') orderId: string) {
    return this.service.markOrderDelivered(req.user.id, orderId);
  }

  @Put('orders/:orderId/ready')
  @ApiOperation({ summary: 'Admin marca pedido listo para recoger — dispara agrupamiento' })
  async markReady(@Param('orderId') orderId: string) {
    return this.service.markOrderReady(orderId);
  }
}
