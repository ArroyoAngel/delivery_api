import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { RestaurantsModule } from './restaurants/restaurants.module';
import { OrdersModule } from './orders/orders.module';
import { AddressesModule } from './addresses/addresses.module';
import { SystemConfigModule } from './system-config/system-config.module';
import { DeliveryGroupsModule } from './delivery-groups/delivery-groups.module';
import { AiModule } from './ai/ai.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { AuthorizationModule } from './authorization/authorization.module';
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
    ConfigModule.forRoot({ isGlobal: true }),
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
            synchronize: false,
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
    RestaurantsModule,
    OrdersModule,
    AddressesModule,
    SystemConfigModule,
    DeliveryGroupsModule,
    AiModule,
    UsersModule,
    RolesModule,
  ],
})
export class AppModule {}
