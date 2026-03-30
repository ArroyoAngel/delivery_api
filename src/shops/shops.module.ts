import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShopsController } from './shops.controller';
import { ShopsService } from './shops.service';
import { ShopStaffService } from './shop-staff.service';
import { ShopScheduleService } from './shop-schedule.service';
import { ShopEntity } from './entities/shop.entity';
import { MenuItemEntity } from './entities/menu-item.entity';
import { ShopScheduleEntity } from './entities/shop-schedule.entity';
import { BusinessTypeEntity } from './entities/business-type.entity';
import { AuthModule } from '../auth/auth.module';
import { EventsModule } from '../events/events.module';
import { ZonesModule } from '../zones/zones.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ShopEntity,
      MenuItemEntity,
      ShopScheduleEntity,
      BusinessTypeEntity,
    ]),
    AuthModule,
    EventsModule,
    ZonesModule,
  ],
  controllers: [ShopsController],
  providers: [
    ShopsService,
    ShopStaffService,
    ShopScheduleService,
  ],
})
export class ShopsModule {}
