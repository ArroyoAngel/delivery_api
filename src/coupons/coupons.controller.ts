import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { CasbinGuard } from '../authorization/guards/casbin.guard';
import { CouponsService } from './coupons.service';
import { DataSource } from 'typeorm';

@ApiTags('Cupones')
@Controller('coupons')
@UseGuards(AuthGuard('jwt'), CasbinGuard)
@ApiBearerAuth()
export class CouponsController {
  constructor(
    private readonly svc: CouponsService,
    private readonly dataSource: DataSource,
  ) {}

  // ── Validación (todos los roles autenticados) ─────────────────────────────

  @Post('validate')
  @ApiOperation({ summary: 'Validar cupón y obtener descuento' })
  validate(
    @Body() body: { code: string; subtotal: number; deliveryFee: number; shopId: string },
  ) {
    return this.svc.validate(body.code, body.subtotal, body.deliveryFee, body.shopId);
  }

  // ── Superadmin: control total ─────────────────────────────────────────────

  /** (SA) Crear cupón de plataforma — puede elegir tipo y quién absorbe */
  @Post()
  @ApiOperation({ summary: '(SA) Crear cupón de plataforma' })
  createSA(
    @Request() req: any,
    @Body()
    body: {
      code: string;
      description?: string;
      type: string;
      value: number;
      absorbsCost?: string;
      minOrderAmount?: number;
      maxUses?: number;
      expiresAt?: string;
      shopId?: string;
    },
  ) {
    return this.svc.createAsSuperadmin(req.user.id, body);
  }

  /** (SA) Listar todos los cupones */
  @Get()
  @ApiOperation({ summary: '(SA) Listar todos los cupones' })
  findAll() {
    return this.svc.findAll();
  }

  /** (SA) Desactivar cualquier cupón */
  @Patch(':id/deactivate')
  @ApiOperation({ summary: '(SA) Desactivar cupón' })
  deactivate(@Param('id') id: string) {
    return this.svc.deactivate(id);
  }

  /** (SA) Reactivar cualquier cupón */
  @Patch(':id/activate')
  @ApiOperation({ summary: '(SA) Reactivar cupón' })
  activate(@Param('id') id: string) {
    return this.svc.activate(id);
  }

  // ── Admin de negocio: solo cupones de su shop ─────────────────────────────

  /** (Admin) Crear cupón del negocio — absorbs_cost forzado a 'shop', sin delivery_free */
  @Post('shop')
  @ApiOperation({ summary: '(Admin) Crear cupón del negocio' })
  async createShop(
    @Request() req: any,
    @Body()
    body: {
      code: string;
      description?: string;
      type: 'product_pct' | 'product_fixed';
      value: number;
      minOrderAmount?: number;
      maxUses?: number;
      expiresAt?: string;
    },
  ) {
    const shopId = await this._resolveShopId(req.user.id);
    return this.svc.createAsShopAdmin(req.user.id, shopId, body);
  }

  /** (Admin) Listar cupones de su negocio */
  @Get('shop')
  @ApiOperation({ summary: '(Admin) Listar cupones de mi negocio' })
  async findShop(@Request() req: any) {
    const shopId = await this._resolveShopId(req.user.id);
    return this.svc.findByShop(shopId);
  }

  /** (Admin) Desactivar cupón de su negocio */
  @Patch('shop/:id/deactivate')
  @ApiOperation({ summary: '(Admin) Desactivar cupón del negocio' })
  async deactivateShop(@Request() req: any, @Param('id') id: string) {
    const shopId = await this._resolveShopId(req.user.id);
    return this.svc.deactivate(id, shopId);
  }

  /** (Admin) Reactivar cupón de su negocio */
  @Patch('shop/:id/activate')
  @ApiOperation({ summary: '(Admin) Reactivar cupón del negocio' })
  async activateShop(@Request() req: any, @Param('id') id: string) {
    const shopId = await this._resolveShopId(req.user.id);
    return this.svc.activate(id, shopId);
  }

  // ── Helper ────────────────────────────────────────────────────────────────

  private async _resolveShopId(accountId: string): Promise<string> {
    const [row] = await this.dataSource.query(
      `SELECT r.id FROM shops r
       LEFT JOIN admins a ON a.shop_id = r.id
       LEFT JOIN profiles p ON p.id = a.profile_id
       WHERE r.owner_account_id = $1 OR p.account_id = $1
       LIMIT 1`,
      [accountId],
    );
    if (!row) throw new Error('No se encontró el negocio asociado a esta cuenta');
    return row.id;
  }
}
