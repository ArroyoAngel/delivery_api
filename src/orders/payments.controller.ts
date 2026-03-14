import { Controller, Post, Param, Body, Headers, UnauthorizedException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrdersService } from './orders.service';

/**
 * Endpoints llamados por el banco (BNB/BCB) como webhooks de pago.
 * NO requieren JWT — se autentican únicamente con el header x-payment-secret.
 */
@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly orders: OrdersService) {}

  private checkSecret(secret: string): void {
    const expected = process.env.PAYMENT_WEBHOOK_SECRET ?? 'webhook_secret_dev_2024';
    if (secret !== expected) throw new UnauthorizedException('Secret de pago inválido');
  }

  @Post('order/:id')
  @ApiOperation({ summary: 'Confirmar pago de un pedido individual (webhook BNB)' })
  confirmOrderPayment(
    @Param('id') id: string,
    @Headers('x-payment-secret') secret: string,
    @Body() body: { reference?: string; paidAmount?: number },
  ) {
    this.checkSecret(secret);
    return this.orders.confirmPayment(id, body?.paidAmount);
  }

  @Post('group/:groupId')
  @ApiOperation({ summary: 'Confirmar pago de un grupo express (webhook BNB)' })
  confirmGroupPayment(
    @Param('groupId') groupId: string,
    @Headers('x-payment-secret') secret: string,
    @Body() body: { paidAmount?: number },
  ) {
    this.checkSecret(secret);
    return this.orders.confirmGroupPayment(groupId, body?.paidAmount);
  }
}
