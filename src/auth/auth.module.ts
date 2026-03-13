import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AccountEntity } from './account.entity';
import { ProfileEntity } from '../profiles/profile.entity';
import { ClientEntity } from '../profiles/client.entity';
import { RiderEntity } from '../profiles/rider.entity';
import { AdminEntity } from '../profiles/admin.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([AccountEntity, ProfileEntity, ClientEntity, RiderEntity, AdminEntity]),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.get('JWT_SECRET', 'yadelivery_jwt_secret_2024'),
        signOptions: { expiresIn: cfg.get('JWT_EXPIRES_IN', '7d') },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtAuthGuard],
  exports: [JwtAuthGuard, AuthService],
})
export class AuthModule {}
