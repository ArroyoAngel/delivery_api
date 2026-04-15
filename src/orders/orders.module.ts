import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersController } from './orders.controller';
import { PaymentsController } from './payments.controller';
import { OrdersService } from './orders.service';
import { OrderEntity } from './entities/order.entity';
import { AuthModule } from '../auth/auth.module';
import { DeliveryGroupsModule } from '../delivery-groups/delivery-groups.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SystemConfigModule } from '../system-config/system-config.module';
import { CouponsModule } from '../coupons/coupons.module';
import { CreditsModule } from '../credits/credits.module';
import { EventsModule } from '../events/events.module';
import { FirebaseStorageModule } from '../firebase-storage/firebase-storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([OrderEntity]),
    AuthModule,
    DeliveryGroupsModule,
    NotificationsModule,
    SystemConfigModule,
    CouponsModule,
    CreditsModule,
    EventsModule,
    FirebaseStorageModule,
  ],
  controllers: [OrdersController, PaymentsController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
