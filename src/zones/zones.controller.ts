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
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CasbinGuard } from '../authorization/guards/casbin.guard';
import { ZonesService } from './zones.service';
import { CreateZoneDto, UpdateZoneDto } from './dto/zone.dto';

@ApiTags('zones')
@UseGuards(JwtAuthGuard, CasbinGuard)
@Controller('zones')
export class ZonesController {
  constructor(private readonly svc: ZonesService) {}

  @Get()
  findAll() {
    return this.svc.findAll();
  }

  /** Detecta la zona que cubre las coordenadas dadas. */
  @Get('detect')
  detect(@Query('lat') lat: string, @Query('lng') lng: string) {
    return this.svc.detect(Number(lat), Number(lng));
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateZoneDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateZoneDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }
}
