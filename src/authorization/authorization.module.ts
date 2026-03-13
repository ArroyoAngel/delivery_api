import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolEntity } from './entities/rol.entity';
import { CasbinRuleEntity } from './entities/casbin-rule.entity';

@Module({
  imports: [TypeOrmModule.forFeature([RolEntity, CasbinRuleEntity])],
  exports: [TypeOrmModule],
})
export class AuthorizationModule {}
