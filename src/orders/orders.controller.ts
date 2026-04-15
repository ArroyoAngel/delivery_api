import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  Request,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
import { FirebaseStorageService } from '../firebase-storage/firebase-storage.service';

@ApiTags('Orders')
@Controller('orders')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly groups: DeliveryGroupsService,
    private readonly firebase: FirebaseStorageService,
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
  @ApiOperation({
    summary:
      'Checkout express multi-negocio — crea un grupo de entrega inmediato',
  })
  expressCheckout(@Request() req, @Body() dto: ExpressCheckoutDto) {
    return this.orders.expressCheckout(req.user.id, dto);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancelar pedido (cliente)' })
  cancel(@Request() req, @Param('id') id: string) {
    return this.orders.cancelOrder(req.user.id, id);
  }

  @Post(':id/rider-cancel')
  @UseGuards(CasbinGuard)
  @ApiOperation({ summary: 'Rider cancela un pedido con motivo' })
  riderCancel(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { reason: string },
  ) {
    return this.orders.riderCancelOrder(req.user.id, id, body.reason ?? '');
  }

  @Put(':id/status')
  @UseGuards(CasbinGuard)
  @ApiOperation({
    summary: 'Actualizar estado de pedido — solo admin / superadmin',
  })
  updateStatus(@Param('id') id: string, @Body() body: { status: string }) {
    return this.orders.updateStatus(id, body.status);
  }

  @Get('shop/mine')
  @UseGuards(CasbinGuard)
  @ApiOperation({ summary: 'Pedidos de mi negocio' })
  shopOrders(@Request() req) {
    return this.orders.findShopOrders(req.user.id);
  }

  @Get('shop/local/area-kind-options')
  @UseGuards(CasbinGuard)
  @ApiOperation({ summary: 'Tipos de zona disponibles para este negocio (globales + propios)' })
  shopAreaKindOptions(@Request() req) {
    return this.orders.getShopAreaKindOptions(req.user.id);
  }

  @Get('shop/local/areas')
  @UseGuards(CasbinGuard)
  @ApiOperation({ summary: 'Áreas/mesas para servicio en local' })
  shopLocalAreas(@Request() req) {
    return this.orders.getShopServiceAreas(req.user.id);
  }

  @Post('shop/local/areas')
  @UseGuards(CasbinGuard)
  @ApiOperation({ summary: 'Crear área/mesa para servicio en local (resuelve negocio del requester)' })
  createShopLocalArea(
    @Request() req,
    @Body() dto: CreateRestaurantServiceAreaDto,
  ) {
    return this.orders.createShopServiceArea(req.user.id, dto);
  }

  @Get('shop/:shopId/local/areas')
  @UseGuards(CasbinGuard)
  @ApiOperation({ summary: 'Áreas/mesas de un negocio específico por ID' })
  shopAreasByShopId(@Param('shopId') shopId: string) {
    return this.orders.getShopServiceAreasByShopId(shopId);
  }

  @Post('shop/:shopId/local/areas')
  @UseGuards(CasbinGuard)
  @ApiOperation({ summary: 'Crear área/mesa en un negocio específico por ID' })
  createAreaForShop(
    @Param('shopId') shopId: string,
    @Body() dto: CreateRestaurantServiceAreaDto,
  ) {
    return this.orders.createShopServiceAreaForShop(shopId, dto);
  }

  @Post('shop/local/cash')
  @UseGuards(CasbinGuard)
  @ApiOperation({
    summary:
      'Registrar orden local/recogida pagada en efectivo (estado confirmado)',
  })
  createShopLocalCashOrder(
    @Request() req,
    @Body() dto: CreateRestaurantLocalOrderDto,
  ) {
    return this.orders.createShopLocalCashOrder(req.user.id, dto);
  }

  // ── Estado: confirmado → preparando (admin/negocio) ──────────────────
  @Put(':id/preparing')
  @UseGuards(CasbinGuard)
  @ApiOperation({ summary: 'Marcar pedido en preparación — admin' })
  markPreparing(@Request() req: any, @Param('id') id: string) {
    return this.groups.markOrderPreparing(id, req.user.id);
  }

  // ── Estado: preparando → listo (admin/negocio) ───────────────────────
  @Put(':id/ready')
  @UseGuards(CasbinGuard)
  @ApiOperation({ summary: 'Marcar pedido listo para recoger — admin' })
  markReady(@Request() req: any, @Param('id') id: string) {
    return this.groups.markOrderReady(id, req.user.id);
  }

  // ── Estado: listo → en_camino (rider recogió del negocio) ────────────
  @Put(':id/on-the-way')
  @UseGuards(CasbinGuard)
  @ApiOperation({ summary: 'Confirmar recogida del negocio — rider' })
  markOnTheWay(@Request() req: any, @Param('id') id: string) {
    return this.groups.markOrderPickedUp(req.user.id, id);
  }

  // ── Estado: preparando → entregado (negocio entrega en mesa/local, sin rider) ──
  @Put(':id/deliver')
  @UseGuards(CasbinGuard)
  @ApiOperation({ summary: 'Marcar pedido entregado en local — negocio (consumo en mesa)' })
  markDeliverLocal(@Request() req: any, @Param('id') id: string) {
    return this.groups.markLocalOrderDelivered(id, req.user.id);
  }

  // ── Estado: en_camino → entregado (rider entregó al cliente) ─────────────
  @Put(':id/done')
  @UseGuards(CasbinGuard)
  @ApiOperation({ summary: 'Confirmar entrega al cliente — rider' })
  markDone(@Request() req: any, @Param('id') id: string) {
    return this.groups.markOrderDelivered(req.user.id, id);
  }

  // ── Confirmación manual de pago QR ─────────────────────────────────────
  @Post(':id/payment-proof')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Subir comprobante de pago (cliente)' })
  async uploadPaymentProof(
    @Request() req,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file provided');
    const proofUrl = await this.firebase.upload(file, 'payment-proofs');
    await this.orders.uploadPaymentProof(req.user.id, id, proofUrl);
    return { id, proofUrl };
  }

  @Post(':id/confirm-manual')
  @UseGuards(CasbinGuard)
  @ApiOperation({
    summary: 'Confirmar pago manualmente (superadmin) — respeta regla de membresía',
  })
  manualConfirmPayment(@Param('id') id: string) {
    return this.orders.manualConfirmPayment(id);
  }

  @Post(':id/reject-payment')
  @UseGuards(CasbinGuard)
  @ApiOperation({ summary: 'Rechazar pago (superadmin)' })
  rejectPayment(
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.orders.rejectPayment(id, body.reason || '');
  }
}
