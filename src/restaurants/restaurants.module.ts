import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RestaurantsController } from './restaurants.controller';
import { RestaurantsService } from './restaurants.service';
import { RestaurantStaffService } from './restaurant-staff.service';
import { RestaurantScheduleService } from './restaurant-schedule.service';
import { RestaurantEntity } from './entities/restaurant.entity';
import { MenuItemEntity } from './entities/menu-item.entity';
import { RestaurantScheduleEntity } from './entities/restaurant-schedule.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RestaurantEntity, MenuItemEntity, RestaurantScheduleEntity]),
    AuthModule,
  ],
  controllers: [RestaurantsController],
  providers: [RestaurantsService, RestaurantStaffService, RestaurantScheduleService],
})
export class RestaurantsModule {}
