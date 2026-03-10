import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrderEntity } from './entities/order.entity';
import { AuthModule } from '../auth/auth.module';
import { DeliveryGroupsModule } from '../delivery-groups/delivery-groups.module';

@Module({
  imports: [TypeOrmModule.forFeature([OrderEntity]), AuthModule, DeliveryGroupsModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
