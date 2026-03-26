import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeliveryGroupEntity } from './entities/delivery-group.entity';
import { OrderEntity } from '../orders/entities/order.entity';
import { DeliveryGroupsService } from './delivery-groups.service';
import { DeliveryGroupsController } from './delivery-groups.controller';
import { AuthModule } from '../auth/auth.module';
import { SystemConfigModule } from '../system-config/system-config.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DeliveryGroupEntity, OrderEntity]),
    AuthModule,
    SystemConfigModule,
    NotificationsModule,
    EventsModule,
  ],
  controllers: [DeliveryGroupsController],
  providers: [DeliveryGroupsService],
  exports: [DeliveryGroupsService],
})
export class DeliveryGroupsModule {}
