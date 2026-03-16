import { Module } from '@nestjs/common';
import { PaymentsAdminController } from './payments-admin.controller';
import { PaymentsAdminService } from './payments-admin.service';

@Module({
  controllers: [PaymentsAdminController],
  providers: [PaymentsAdminService],
})
export class PaymentsModule {}
