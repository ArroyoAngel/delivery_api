import {
  Body, Controller, Get, Param, Post, Put,
  UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CasbinGuard } from '../authorization/guards/casbin.guard';
import { SystemConfigService } from './system-config.service';
import { FirebaseStorageService } from '../firebase-storage/firebase-storage.service';

@ApiTags('Config')
@Controller('config')
export class SystemConfigController {
  constructor(
    private readonly cfg: SystemConfigService,
    private readonly storage: FirebaseStorageService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listar configuraciones del sistema' })
  findAll() {
    return this.cfg.findAll();
  }

  @Get(':key')
  @ApiOperation({ summary: 'Obtener configuración por clave' })
  findOne(@Param('key') key: string) {
    return this.cfg.get(key);
  }

  @Put(':key')
  @UseGuards(JwtAuthGuard, CasbinGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Actualizar configuración — solo superadmin' })
  update(@Param('key') key: string, @Body() body: { value: string }) {
    return this.cfg.set(key, body.value);
  }

  @Post('upload-image')
  @UseGuards(JwtAuthGuard, CasbinGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Subir imagen para configuración (ej. QR estático)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        cb(null, /\.(jpg|jpeg|png|webp|gif)$/i.test(file.originalname));
      },
    }),
  )
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    const url = await this.storage.upload(file, 'config');
    return { url };
  }
}
