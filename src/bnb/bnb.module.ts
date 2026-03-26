import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BnbService } from './bnb.service';

@Module({
  imports: [ConfigModule],
  providers: [BnbService],
  exports: [BnbService],
})
export class BnbModule {}
