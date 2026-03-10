import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { UserEntity } from './user.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity) private users: Repository<UserEntity>,
    private jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.users.findOne({ where: { email } });
    const plainMode = process.env.AUTH_PLAIN_PASSWORD === 'true';
    if (!user || (plainMode ? user.password !== password : user.password !== password)) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    return { accessToken: this.jwt.sign({ sub: user.id, email: user.email, roles: user.roles }) };
  }

  async register(email: string, password: string, firstName: string, lastName: string) {
    const exists = await this.users.findOne({ where: { email } });
    if (exists) throw new ConflictException('Email ya registrado');
    const user = this.users.create({ email, password, firstName, lastName });
    const saved = await this.users.save(user);
    return { accessToken: this.jwt.sign({ sub: saved.id, email: saved.email, roles: saved.roles }) };
  }

  async googleLogin(idToken: string) {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
    if (!res.ok) throw new BadRequestException('Token de Google inválido');
    const payload: any = await res.json();
    if (payload.error) throw new BadRequestException('Token de Google inválido');

    const { sub: googleId, email, given_name: firstName, family_name: lastName, picture: avatarUrl } = payload;

    let user = await this.users.findOne({ where: { googleId } });
    if (!user) {
      user = await this.users.findOne({ where: { email } });
      if (user) {
        await this.users.update(user.id, { googleId, avatarUrl });
        user.googleId = googleId;
      } else {
        user = await this.users.save(
          this.users.create({ email, googleId, firstName, lastName, avatarUrl }),
        );
      }
    }
    return { accessToken: this.jwt.sign({ sub: user.id, email: user.email, roles: user.roles }) };
  }

  async me(userId: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const { password, ...rest } = user as any;
    return rest;
  }
}
