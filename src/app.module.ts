import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { ShopsModule } from './shops/shops.module';
import { OrdersModule } from './orders/orders.module';
import { AddressesModule } from './addresses/addresses.module';
import { SystemConfigModule } from './system-config/system-config.module';
import { DeliveryGroupsModule } from './delivery-groups/delivery-groups.module';
import { AiModule } from './ai/ai.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { PaymentsModule } from './payments/payments.module';
import { AuthorizationModule } from './authorization/authorization.module';
import { NotificationsModule } from './notifications/notifications.module';
import { TelegramModule } from './telegram/telegram.module';
import { ZonesModule } from './zones/zones.module';
import { SupportModule } from './support/support.module';
import { CouponsModule } from './coupons/coupons.module';
import { CreditsModule } from './credits/credits.module';
import { RatingsModule } from './ratings/ratings.module';
import { FirebaseStorageModule } from './firebase-storage/firebase-storage.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AuthZModule, AUTHZ_ENFORCER } from 'nest-authz';
import TypeORMAdapter from 'typeorm-adapter';
import { newEnforcer, newModel } from 'casbin';

/**
 * Modelo CASBIN (definido inline para evitar dependencia de archivo externo).
 *
 * - r = sub, obj, act      → request (rol, ruta, método HTTP)
 * - p = sub, obj, act, eft, type → policy almacenada en casbin_rule
 * - keyMatch2              → soporta rutas con parámetros /:id
 * - regexMatch             → soporta acciones tipo "GET|POST|PATCH"
 * - p.type == "backend"    → solo aplica reglas de backend
 */
const CASBIN_MODEL = `
[request_definition]
r = sub, obj, act

[policy_definition]
p = sub, obj, act, eft, type

[policy_effect]
e = some(where (p.eft == allow))

[matchers]
m = r.sub == p.sub && keyMatch2(r.obj, p.obj) && regexMatch(r.act, p.act) && p.eft == "allow" && p.type == "backend"
`; // v2

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (cfg: ConfigService) => ({
        type: 'postgres',
        host: cfg.get('DB_HOST', 'localhost'),
        port: cfg.get<number>('DB_PORT', 5432),
        database: cfg.get('DB_NAME', 'delivery'),
        username: cfg.get('DB_USER', 'arroyo'),
        password: cfg.get('DB_PASSWORD', 'arroyo1234'),
        synchronize: false,
        autoLoadEntities: true,
      }),
      inject: [ConfigService],
    }),
    AuthZModule.register({
      enforcerProvider: {
        provide: AUTHZ_ENFORCER,
        useFactory: async (cfg: ConfigService) => {
          const adapter = await TypeORMAdapter.newAdapter({
            type: 'postgres',
            host: cfg.get('DB_HOST', 'localhost'),
            port: cfg.get<number>('DB_PORT', 5432),
            database: cfg.get('DB_NAME', 'delivery'),
            username: cfg.get('DB_USER', 'arroyo'),
            password: cfg.get('DB_PASSWORD', 'arroyo1234'),
            synchronize: true,
          });
          return newEnforcer(newModel(CASBIN_MODEL), adapter);
        },
        inject: [ConfigService],
      },
      imports: [ConfigModule],
      userFromContext: (ctx) => ctx.switchToHttp().getRequest()?.user,
    }),
    AuthorizationModule,
    AuthModule,
    ShopsModule,
    OrdersModule,
    AddressesModule,
    SystemConfigModule,
    DeliveryGroupsModule,
    AiModule,
    UsersModule,
    RolesModule,
    PaymentsModule,
    NotificationsModule,
    TelegramModule,
    ZonesModule,
    SupportModule,
    CouponsModule,
    CreditsModule,
    RatingsModule,
    FirebaseStorageModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
