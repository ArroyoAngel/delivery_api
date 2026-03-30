import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateZoneDto {
  @IsString() name: string;
  @IsString() city: string;
  @IsNumber() centerLat: number;
  @IsNumber() centerLng: number;
  @IsOptional() @IsNumber() radiusMeters?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateZoneDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsNumber() centerLat?: number;
  @IsOptional() @IsNumber() centerLng?: number;
  @IsOptional() @IsNumber() radiusMeters?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
