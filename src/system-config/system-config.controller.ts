import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CasbinGuard } from '../authorization/guards/casbin.guard';
import { SystemConfigService } from './system-config.service';

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
}
