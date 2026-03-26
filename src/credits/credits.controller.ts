import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CasbinGuard } from '../authorization/guards/casbin.guard';
import { CreditsService } from './credits.service';

const uploadDir = join(process.cwd(), 'uploads');
if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });

@ApiTags('Credits')
@Controller('credits')
@UseGuards(JwtAuthGuard, CasbinGuard)
@ApiBearerAuth()
export class CreditsController {
  constructor(private readonly service: CreditsService) {}

  // ── Paquetes ──────────────────────────────────────────────────────────────

  @Get('packages')
  @ApiOperation({ summary: 'Listar paquetes de créditos disponibles' })
  listPackages(@Query('all') all?: string) {
    return this.service.listPackages(all !== 'true');
  }

  @Post('packages')
  @ApiOperation({ summary: 'Crear paquete de créditos (superadmin)' })
  createPackage(
    @Body()
    body: {
      name: string;
      credits: number;
      bonusCredits?: number;
      price: number;
      sortOrder?: number;
    },
  ) {
    return this.service.createPackage(body);
  }

  @Patch('packages/:id')
  @ApiOperation({ summary: 'Actualizar paquete de créditos (superadmin)' })
  updatePackage(
    @Param('id') id: string,
    @Body()
    body: Partial<{
      name: string;
      credits: number;
      bonusCredits: number;
      price: number;
      isActive: boolean;
      sortOrder: number;
    }>,
  ) {
    return this.service.updatePackage(id, body);
  }

  // ── Compra (rider) ────────────────────────────────────────────────────────

  @Post('packages/:id/claim')
  @ApiOperation({ summary: 'Rider inicia compra — backend genera QR BNB dinámico' })
  claim(@Request() req: any, @Param('id') packageId: string) {
    return this.service.claimPurchase(req.user.id, packageId);
  }

  @Post('purchases/:id/proof')
  @ApiOperation({ summary: 'Rider sube comprobante de pago' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: uploadDir,
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
          cb(null, `${unique}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        cb(null, /\.(jpg|jpeg|png|webp)$/i.test(file.originalname));
      },
    }),
  )
  submitProof(
    @Request() req: any,
    @Param('id') purchaseId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.service.submitProof(req.user.id, purchaseId, file);
  }

  @Delete('purchases/:id')
  @ApiOperation({ summary: 'Rider cancela una compra pendiente' })
  cancel(@Request() req: any, @Param('id') purchaseId: string) {
    return this.service.cancelPurchase(req.user.id, purchaseId);
  }

  @Get('my-balance')
  @ApiOperation({ summary: 'Mi saldo y código de repartidor' })
  myBalance(@Request() req: any) {
    return this.service.getMyBalance(req.user.id);
  }

  @Get('my-history')
  @ApiOperation({ summary: 'Mi historial de compras (rider)' })
  myHistory(@Request() req: any) {
    return this.service.myPurchaseHistory(req.user.id);
  }

  // ── Admin ─────────────────────────────────────────────────────────────────

  @Post('admin/refresh-qr')
  @ApiOperation({ summary: 'Regenerar QR de todos los paquetes (superadmin)' })
  refreshQr() {
    return this.service.refreshAllQrData();
  }

  @Post('admin/confirm/:reference')
  @ApiOperation({ summary: 'Confirmar pago de créditos manualmente (superadmin)' })
  confirm(@Param('reference') reference: string) {
    return this.service.confirmCreditPurchase(reference);
  }

  @Get('admin/purchases')
  @ApiOperation({ summary: 'Todas las compras de créditos (superadmin)' })
  allPurchases() {
    return this.service.allPurchases();
  }

  @Get('admin/rider-balances')
  @ApiOperation({ summary: 'Saldo de créditos de todos los riders (superadmin)' })
  riderBalances() {
    return this.service.getAllRiderBalances();
  }
}
