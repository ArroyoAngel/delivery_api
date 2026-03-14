import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersController } from './orders.controller';
import { PaymentsController } from './payments.controller';
import { OrdersService } from './orders.service';
import { OrderEntity } from './entities/order.entity';
import { AuthModule } from '../auth/auth.module';
import { DeliveryGroupsModule } from '../delivery-groups/delivery-groups.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [TypeOrmModule.forFeature([OrderEntity]), AuthModule, DeliveryGroupsModule, NotificationsModule],
  controllers: [OrdersController, PaymentsController],
  providers: [OrdersService],
})
export class OrdersModule {}
