export class CreateZoneDto {
  name: string;
  city: string;
  centerLat: number;
  centerLng: number;
  radiusMeters?: number;
  isActive?: boolean;
}

export class UpdateZoneDto {
  name?: string;
  city?: string;
  centerLat?: number;
  centerLng?: number;
  radiusMeters?: number;
  isActive?: boolean;
}
