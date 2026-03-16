import {
  BadRequestException,
  Controller,
  Post,
  Body,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
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
    const expected =
      process.env.PAYMENT_WEBHOOK_SECRET ?? 'webhook_secret_dev_2024';
    if (secret !== expected)
      throw new UnauthorizedException('Secret de pago inválido');
  }

  @Post('confirm')
  @ApiOperation({
    summary: 'Confirmar pago por referencia unificada (orden o grupo)',
  })
  confirmByReference(
    @Headers('x-payment-secret') secret: string,
    @Body()
    body: {
      reference?: string;
      paidAmount?: number;
      bankTransactionId?: string;
      bankProvider?: string;
    },
  ) {
    this.checkSecret(secret);
    if (!body?.reference)
      throw new BadRequestException('reference es requerido');
    return this.orders.confirmPaymentByReference(
      body.reference,
      body?.paidAmount,
      body?.bankTransactionId,
      body?.bankProvider,
      body,
    );
  }
}
