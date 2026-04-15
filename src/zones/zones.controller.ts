import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CasbinGuard } from '../authorization/guards/casbin.guard';
import { ZonesService } from './zones.service';
import { CreateZoneDto, UpdateZoneDto } from './dto/zone.dto';

@ApiTags('zones')
@Controller('zones')
export class ZonesController {
  constructor(private readonly svc: ZonesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar todas las zonas de cobertura (público)' })
  findAll() {
    return this.svc.findAll();
  }

  /** Detecta la zona que cubre las coordenadas dadas. */
  @Get('detect')
  @ApiOperation({ summary: 'Detectar zona por coordenadas (público)' })
  detect(@Query('lat') lat: string, @Query('lng') lng: string) {
    return this.svc.detect(Number(lat), Number(lng));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener zona por ID (público)' })
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, CasbinGuard)
  @ApiOperation({ summary: 'Crear zona (requiere autenticación)' })
  create(@Body() dto: CreateZoneDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, CasbinGuard)
  @ApiOperation({ summary: 'Actualizar zona (requiere autenticación)' })
  update(@Param('id') id: string, @Body() dto: UpdateZoneDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, CasbinGuard)
  @ApiOperation({ summary: 'Eliminar zona (requiere autenticación)' })
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }
}
