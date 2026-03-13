import { Controller, Post, Get, Body, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'Iniciar sesión' })
  login(@Body() body: { email: string; password: string }) {
    return this.auth.login(body.email, body.password);
  }

  @Post('register')
  @ApiOperation({ summary: 'Registrarse' })
  register(@Body() body: { email: string; password: string; firstName: string; lastName: string }) {
    return this.auth.register(body.email, body.password, body.firstName, body.lastName);
  }

  @Post('google')
  @ApiOperation({ summary: 'Login con Google (idToken)' })
  googleLogin(@Body() body: { idToken: string }) {
    return this.auth.googleLogin(body.idToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mi perfil' })
  me(@Request() req) {
    return this.auth.me(req.user.id);
  }

  @Get('frontend-access')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Rutas de frontend permitidas para el usuario actual' })
  frontendAccess(@Request() req) {
    return this.auth.getFrontendAccess(req.user.id, req.user.roles ?? []);
  }
}
