import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreditPackageEntity } from './entities/credit-package.entity';
import { CreditPurchaseEntity } from './entities/credit-purchase.entity';
import { CreditsService } from './credits.service';
import { CreditsController } from './credits.controller';
import { CreditPollingService } from './credit-polling.service';
import { SystemConfigModule } from '../system-config/system-config.module';
import { BnbModule } from '../bnb/bnb.module';
import { EventsModule } from '../events/events.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CreditPackageEntity, CreditPurchaseEntity]),
    SystemConfigModule,
    BnbModule,
    EventsModule,
    NotificationsModule,
  ],
  controllers: [CreditsController],
  providers: [CreditsService, CreditPollingService],
  exports: [CreditsService],
})
export class CreditsModule {}
