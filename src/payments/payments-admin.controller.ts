import { Controller, Get, Param, Query, Request, UseGuards } from '@nestjs/common';
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
  @ApiOperation({ summary: 'Listado de cuentas bancarias (restaurantes y riders)' })
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
  @ApiOperation({ summary: 'Mis ingresos (restaurante dueño o staff)' })
  getMyIncome(@Request() req: any) {
    return this.paymentsAdmin.getMyIncomeSummary(req.user.id);
  }

  @Get('my/bank-accounts')
  @ApiOperation({ summary: 'Mis cuentas bancarias (restaurante dueño o staff)' })
  getMyBankAccounts(@Request() req: any) {
    return this.paymentsAdmin.getMyBankAccounts(req.user.id);
  }

  @Get('my/withdrawals')
  @ApiOperation({ summary: 'Mis retiros (restaurante dueño o staff)' })
  getMyWithdrawals(@Request() req: any, @Query('limit') limit?: string) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
    return this.paymentsAdmin.getMyWithdrawals(req.user.id, safeLimit);
  }

  // ── SA: per-restaurant endpoints ──────────────────────────────────────────

  @Get('admin/restaurant/:id/income')
  @ApiOperation({ summary: 'Ingresos de un restaurante (superadmin)' })
  getRestaurantIncome(@Param('id') id: string) {
    return this.paymentsAdmin.getRestaurantIncomeSummary(id);
  }

  @Get('admin/restaurant/:id/bank-accounts')
  @ApiOperation({ summary: 'Cuentas bancarias de un restaurante (superadmin)' })
  getRestaurantBankAccounts(@Param('id') id: string) {
    return this.paymentsAdmin.getRestaurantBankAccounts(id);
  }

  @Get('admin/restaurant/:id/withdrawals')
  @ApiOperation({ summary: 'Retiros de un restaurante (superadmin)' })
  getRestaurantWithdrawals(@Param('id') id: string, @Query('limit') limit?: string) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
    return this.paymentsAdmin.getRestaurantWithdrawals(id, safeLimit);
  }
}
