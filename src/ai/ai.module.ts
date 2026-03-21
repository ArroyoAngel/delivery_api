import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SystemConfigModule } from '../system-config/system-config.module';
import { OrdersModule } from '../orders/orders.module';
import { AddressesModule } from '../addresses/addresses.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiContextService } from './ai-context.service';
import { AiToolsService } from './ai-tools.service';
import { AiProfileService } from './ai-profile.service';

@Module({
  imports: [AuthModule, SystemConfigModule, OrdersModule, AddressesModule],
  controllers: [AiController],
  providers: [AiService, AiContextService, AiToolsService, AiProfileService],
  exports: [AiService, AiProfileService],
})
export class AiModule {}
