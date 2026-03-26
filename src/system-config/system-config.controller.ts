import {
  Body, Controller, Get, Param, Post, Put,
  UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CasbinGuard } from '../authorization/guards/casbin.guard';
import { SystemConfigService } from './system-config.service';

const uploadDir = join(process.cwd(), 'uploads');
if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });

@ApiTags('Config')
@Controller('config')
export class SystemConfigController {
  constructor(private readonly cfg: SystemConfigService) {}

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
      storage: diskStorage({
        destination: uploadDir,
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
          cb(null, `${unique}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
      fileFilter: (_req, file, cb) => {
        cb(null, /\.(jpg|jpeg|png|webp|gif)$/i.test(file.originalname));
      },
    }),
  )
  uploadImage(@UploadedFile() file: Express.Multer.File) {
    const baseUrl = process.env.API_BASE_URL?.replace('/api', '') ?? 'http://localhost:3002';
    return { url: `${baseUrl}/uploads/${file.filename}` };
  }
}
