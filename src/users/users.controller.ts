import {
  BadRequestException,
  Body, Controller, Get, Param, Patch, Post, Put,
  Query, Request, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UsersService } from './users.service';
import { CasbinGuard } from '../authorization/guards/casbin.guard';
import { FirebaseStorageService } from '../firebase-storage/firebase-storage.service';

@Controller('users')
@UseGuards(AuthGuard('jwt'), CasbinGuard)
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly storage: FirebaseStorageService,
  ) {}

  @Get()
  findAll() {
    return this.users.findAll();
  }

  /** Lista admins raíz con su negocio asociado. Sin contraseña. Solo superadmin. */
  @Get('admins')
  findAdmins() {
    return this.users.findAdmins();
  }

  /** Crea un usuario administrador directamente (sin flujo de registro). Solo superadmin. */
  @Post()
  createAdminUser(
    @Body() body: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      phone?: string;
      startedAt?: string;
    },
  ) {
    return this.users.createAdminUser(body);
  }

  @Put(':id/roles')
  updateRoles(@Param('id') id: string, @Body('roles') roles: string[]) {
    return this.users.updateRoles(id, roles);
  }

  /** Actualiza el perfil propio (teléfono, nombre). Disponible para todos los roles. */
  @Patch('profile')
  updateMyProfile(
    @Request() req: any,
    @Body() body: { phone?: string; firstName?: string; lastName?: string },
  ) {
    return this.users.updateMyProfile(req.user.id, body);
  }

  /** Actualiza el perfil de cualquier usuario. Solo superadmin. */
  @Patch(':id/profile')
  updateUserProfile(
    @Param('id') id: string,
    @Body() body: { phone?: string; firstName?: string; lastName?: string },
  ) {
    return this.users.updateMyProfile(id, body);
  }

  /** Actualiza info extra del rider (licencia, placa, póliza, VIN). Solo superadmin. */
  @Patch(':id/rider-info')
  updateRiderInfo(
    @Param('id') id: string,
    @Body() body: {
      vehicleType?: string | null;
      licenseFrontUrl?: string | null;
      licenseBackUrl?: string | null;
      plate?: string | null;
      policyUrl?: string | null;
      vin?: string | null;
    },
  ) {
    return this.users.updateRiderInfo(id, body);
  }

  /**
   * Sube una imagen de licencia del rider y actualiza el campo correspondiente.
   * ?type=front → licenseFrontUrl   ?type=back → licenseBackUrl
   */
  @Post(':id/upload-rider-image')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        cb(null, /\.(jpg|jpeg|png|webp)$/i.test(file.originalname));
      },
    }),
  )
  async uploadRiderImage(
    @Param('id') id: string,
    @Query('type') type: 'front' | 'back',
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No se recibió ningún archivo');
    const url = await this.storage.upload(file, 'riders');
    const patch = type === 'back'
      ? { licenseBackUrl: url }
      : { licenseFrontUrl: url };
    await this.users.updateRiderInfo(id, patch);
    return { url };
  }

  /** Actualiza info extra del admin (antigüedad). Solo superadmin. */
  @Patch(':id/admin-info')
  updateAdminInfo(
    @Param('id') id: string,
    @Body() body: { startedAt?: string | null },
  ) {
    return this.users.updateAdminInfo(id, body);
  }
}
