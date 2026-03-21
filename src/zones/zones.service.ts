import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { DeliveryZoneEntity } from './zone.entity';
import { CreateZoneDto, UpdateZoneDto } from './dto/zone.dto';

/** Fórmula de Haversine en SQL — devuelve distancia en metros */
const HAVERSINE_SQL = (latParam: string, lngParam: string) => `
  (6371000 * acos(LEAST(1.0,
    cos(radians(z.center_lat)) * cos(radians(${latParam})) *
    cos(radians(${lngParam}) - radians(z.center_lng)) +
    sin(radians(z.center_lat)) * sin(radians(${latParam}))
  )))
`;

@Injectable()
export class ZonesService {
  constructor(
    @InjectRepository(DeliveryZoneEntity)
    private readonly repo: Repository<DeliveryZoneEntity>,
    private readonly dataSource: DataSource,
  ) {}

  findAll(): Promise<DeliveryZoneEntity[]> {
    return this.repo.find({ order: { city: 'ASC', name: 'ASC' } });
  }

  async findOne(id: string): Promise<DeliveryZoneEntity> {
    const zone = await this.repo.findOne({ where: { id } });
    if (!zone) throw new NotFoundException('Zona no encontrada');
    return zone;
  }

  /** Detecta qué zona activa cubre las coordenadas dadas. */
  async detect(lat: number, lng: number): Promise<DeliveryZoneEntity | null> {
    const rows = await this.dataSource.query(
      `SELECT z.* FROM delivery_zones z
       WHERE z.is_active = true
         AND ${HAVERSINE_SQL('$1', '$2')} <= z.radius_meters
       ORDER BY ${HAVERSINE_SQL('$1', '$2')} ASC
       LIMIT 1`,
      [lat, lng],
    );
    if (!rows.length) return null;
    return rows[0] as DeliveryZoneEntity;
  }

  create(dto: CreateZoneDto): Promise<DeliveryZoneEntity> {
    return this.repo.save(
      this.repo.create({
        name: dto.name,
        city: dto.city,
        centerLat: dto.centerLat,
        centerLng: dto.centerLng,
        radiusMeters: dto.radiusMeters ?? 5000,
        isActive: dto.isActive ?? true,
      }),
    );
  }

  async update(id: string, dto: UpdateZoneDto): Promise<DeliveryZoneEntity> {
    const zone = await this.findOne(id);
    Object.assign(zone, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.city !== undefined && { city: dto.city }),
      ...(dto.centerLat !== undefined && { centerLat: dto.centerLat }),
      ...(dto.centerLng !== undefined && { centerLng: dto.centerLng }),
      ...(dto.radiusMeters !== undefined && { radiusMeters: dto.radiusMeters }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
    });
    return this.repo.save(zone);
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.repo.delete(id);
  }
}
