import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountEntity } from '../auth/account.entity';
import { ProfileEntity } from '../profiles/profile.entity';
import { ClientEntity } from '../profiles/client.entity';
import { RiderEntity } from '../profiles/rider.entity';
import { AdminEntity } from '../profiles/admin.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([AccountEntity, ProfileEntity, ClientEntity, RiderEntity, AdminEntity]),
  ],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
