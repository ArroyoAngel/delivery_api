import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountEntity } from './account.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    cfg: ConfigService,
    @InjectRepository(AccountEntity)
    private accounts: Repository<AccountEntity>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: cfg.get('JWT_SECRET', 'yadelivery_jwt_secret_2024'),
    });
  }

  async validate(payload: any) {
    // Leer roles siempre desde la DB para que cambios de rol apliquen de inmediato
    const account = await this.accounts.findOne({
      where: { id: payload.sub },
      select: ['id', 'email', 'roles'],
    });
    const roles = account?.roles ?? payload.roles ?? [];
    return { id: payload.sub, email: payload.email, roles };
  }
}
