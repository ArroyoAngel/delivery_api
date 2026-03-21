import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { CasbinGuard } from '../authorization/guards/casbin.guard';
import { PaymentsAdminService } from './payments-admin.service';

@ApiTags('Payments Admin')
@Controller('payments')
@UseGuards(AuthGuard('jwt'), CasbinGuard)
@ApiBearerAuth()
export class PaymentsAdminController {
  constructor(private readonly paymentsAdmin: PaymentsAdminService) {}

  @Get('admin/summary')
  @ApiOperation({ summary: 'Resumen financiero para panel admin' })
  getSummary() {
    return this.paymentsAdmin.getSummary();
  }

  @Get('admin/list')
  @ApiOperation({ summary: 'Listado de pagos' })
  getList(@Query('limit') limit?: string) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
    return this.paymentsAdmin.getPayments(safeLimit);
  }

  @Get('admin/bank-accounts')
  @ApiOperation({
    summary: 'Listado de cuentas bancarias (negocios y riders)',
  })
  getBankAccounts() {
    return this.paymentsAdmin.getBankAccounts();
  }

  @Get('admin/withdrawals')
  @ApiOperation({ summary: 'Listado de solicitudes de retiro' })
  getWithdrawals(@Query('limit') limit?: string) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
    return this.paymentsAdmin.getWithdrawals(safeLimit);
  }

  @Get('my/income')
  @ApiOperation({ summary: 'Mis ingresos (negocio dueño o staff)' })
  getMyIncome(@Request() req: any) {
    return this.paymentsAdmin.getMyIncomeSummary(req.user.id);
  }

  @Get('my/bank-accounts')
  @ApiOperation({
    summary: 'Mis cuentas bancarias (negocio dueño o staff)',
  })
  getMyBankAccounts(@Request() req: any) {
    return this.paymentsAdmin.getMyBankAccounts(req.user.id);
  }

  @Get('my/withdrawals')
  @ApiOperation({ summary: 'Mis retiros (negocio dueño o staff)' })
  getMyWithdrawals(@Request() req: any, @Query('limit') limit?: string) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
    return this.paymentsAdmin.getMyWithdrawals(req.user.id, safeLimit);
  }

  @Post('my/withdrawal')
  @ApiOperation({ summary: 'Solicitar retiro de fondos (negocio)' })
  requestWithdrawal(
    @Request() req: any,
    @Body() body: { amount: number; bankAccountId: string },
  ) {
    return this.paymentsAdmin.createWithdrawalRequest(
      req.user.id,
      body.amount,
      body.bankAccountId,
    );
  }

  @Put('admin/withdrawals/:id/process')
  @ApiOperation({ summary: 'Aprobar o rechazar solicitud de retiro (superadmin)' })
  processWithdrawal(
    @Param('id') id: string,
    @Body() body: { action: 'completed' | 'rejected'; externalTransferId?: string; notes?: string },
  ) {
    return this.paymentsAdmin.processWithdrawal(id, body.action, body.externalTransferId, body.notes);
  }

  // ── SA: per-shop endpoints ──────────────────────────────────────────

  @Get('admin/shop/:id/income')
  @ApiOperation({ summary: 'Ingresos de un negocio (superadmin)' })
  getShopIncome(@Param('id') id: string) {
    return this.paymentsAdmin.getShopIncomeSummary(id);
  }

  @Get('admin/shop/:id/bank-accounts')
  @ApiOperation({ summary: 'Cuentas bancarias de un negocio (superadmin)' })
  getShopBankAccounts(@Param('id') id: string) {
    return this.paymentsAdmin.getShopBankAccounts(id);
  }

  @Get('admin/shop/:id/withdrawals')
  @ApiOperation({ summary: 'Retiros de un negocio (superadmin)' })
  getShopWithdrawals(
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
    return this.paymentsAdmin.getShopWithdrawals(id, safeLimit);
  }

  // ── Rider: own bank accounts ─────────────────────────────────────────────

  @Get('rider/bank-accounts')
  @ApiOperation({ summary: 'Mis cuentas bancarias (repartidor)' })
  getRiderBankAccounts(@Request() req: any) {
    return this.paymentsAdmin.getRiderBankAccounts(req.user.id);
  }

  @Post('rider/bank-accounts')
  @ApiOperation({ summary: 'Registrar cuenta bancaria (repartidor)' })
  createRiderBankAccount(
    @Request() req: any,
    @Body()
    body: {
      bankName: string;
      accountHolder: string;
      accountNumber: string;
      accountType?: string;
      branchName?: string;
      isDefault?: boolean;
    },
  ) {
    return this.paymentsAdmin.createRiderBankAccount(req.user.id, body);
  }

  @Delete('rider/bank-accounts/:id')
  @ApiOperation({ summary: 'Eliminar cuenta bancaria (repartidor)' })
  deleteRiderBankAccount(@Request() req: any, @Param('id') id: string) {
    return this.paymentsAdmin.deleteRiderBankAccount(req.user.id, id);
  }

  @Get('rider/income')
  @ApiOperation({ summary: 'Mis ingresos y saldo disponible (repartidor)' })
  getRiderIncome(@Request() req: any) {
    return this.paymentsAdmin.getRiderIncomeSummary(req.user.id);
  }

  @Get('rider/withdrawals')
  @ApiOperation({ summary: 'Mis retiros (repartidor)' })
  getRiderWithdrawals(@Request() req: any, @Query('limit') limit?: string) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
    return this.paymentsAdmin.getRiderWithdrawals(req.user.id, safeLimit);
  }

  @Post('rider/withdrawal')
  @ApiOperation({ summary: 'Solicitar retiro de fondos (repartidor)' })
  createRiderWithdrawal(
    @Request() req: any,
    @Body() body: { amount: number; bankAccountId: string },
  ) {
    return this.paymentsAdmin.createRiderWithdrawalRequest(req.user.id, body.amount, body.bankAccountId);
  }
}
