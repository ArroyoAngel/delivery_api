import { IsString, IsArray, IsOptional, IsEnum, ValidateNested, IsNumber, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class OrderItemDto {
  @ApiProperty() @IsString() menuItemId: string;
  @ApiProperty() @IsNumber() @IsPositive() quantity: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;
}

export class CreateOrderDto {
  @ApiProperty() @IsString() restaurantId: string;
  @ApiProperty({ type: [OrderItemDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => OrderItemDto)
  items: OrderItemDto[];
  @ApiProperty({ required: false, enum: ['delivery', 'recogida', 'express'] })
  @IsOptional() @IsEnum(['delivery', 'recogida', 'express']) deliveryType?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() deliveryAddress?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() deliveryLat?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() deliveryLng?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;
}

export class ExpressRestaurantOrderDto {
  @ApiProperty() @IsString() restaurantId: string;
  @ApiProperty({ type: [OrderItemDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => OrderItemDto)
  items: OrderItemDto[];
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;
}

export class ExpressCheckoutDto {
  @ApiProperty({ type: [ExpressRestaurantOrderDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => ExpressRestaurantOrderDto)
  orders: ExpressRestaurantOrderDto[];
  @ApiProperty({ required: false }) @IsOptional() @IsString() deliveryAddress?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() deliveryLat?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() deliveryLng?: number;
}

export class CreateRestaurantLocalOrderDto {
  @ApiProperty({ type: [OrderItemDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @ApiProperty({ enum: ['local', 'recogida'], required: false })
  @IsOptional() @IsEnum(['local', 'recogida']) serviceType?: 'local' | 'recogida';

  @ApiProperty({ required: false }) @IsOptional() @IsString() areaId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() areaLabel?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;
}

export class CreateRestaurantServiceAreaDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ required: false, enum: ['mesa', 'barra', 'salon', 'terraza'] })
  @IsOptional() @IsEnum(['mesa', 'barra', 'salon', 'terraza']) kind?: 'mesa' | 'barra' | 'salon' | 'terraza';
  @ApiProperty({ required: false }) @IsOptional() @IsString() color?: string;
}
