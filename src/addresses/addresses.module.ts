import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AddressesController } from './addresses.controller';
import { AddressesService } from './addresses.service';
import { AddressEntity } from './entities/address.entity';
import { AuthModule } from '../auth/auth.module';
import { ZonesModule } from '../zones/zones.module';

@Module({
  imports: [TypeOrmModule.forFeature([AddressEntity]), AuthModule, ZonesModule],
  controllers: [AddressesController],
  providers: [AddressesService],
  exports: [AddressesService],
})
export class AddressesModule {}
