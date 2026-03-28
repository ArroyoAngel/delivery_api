import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
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

  @Post('register/send-otp')
  @ApiOperation({ summary: 'Paso 1 registro: enviar OTP al email' })
  sendRegisterOtp(@Body() body: { email: string }) {
    return this.auth.sendEmailOtp(body.email).then(() => ({ sent: true }));
  }

  @Post('register')
  @ApiOperation({ summary: 'Paso 2 registro: verificar OTP y crear cuenta' })
  register(
    @Body()
    body: {
      email: string;
      code: string;
      password: string;
      firstName: string;
      lastName: string;
    },
  ) {
    return this.auth.verifyEmailOtpAndRegister(body);
  }

  @Post('google')
  @ApiOperation({ summary: 'Login con Google (idToken)' })
  googleLogin(@Body() body: { idToken: string }) {
    return this.auth.googleLogin(body.idToken);
  }

  @Post('firebase')
  @ApiOperation({ summary: 'Login con Firebase (phone, email link, etc.)' })
  firebaseLogin(@Body() body: { idToken: string }) {
    return this.auth.firebaseLogin(body.idToken);
  }

  @Patch('phone')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verificar y guardar número de teléfono (Firebase OTP)' })
  updatePhone(@Request() req, @Body() body: { idToken: string }) {
    return this.auth.updatePhone(req.user.id, body.idToken);
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Actualizar nombre y apellido del perfil' })
  updateProfile(
    @Request() req,
    @Body() body: { firstName?: string; lastName?: string },
  ) {
    return this.auth.updateProfile(req.user.id, body);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mi perfil' })
  me(@Request() req) {
    return this.auth.me(req.user.id);
  }

  @Post('reset-password/send-otp')
  @ApiOperation({ summary: 'Paso 1 reset: enviar código al email' })
  sendResetOtp(@Body() body: { email: string }) {
    return this.auth.sendPasswordResetOtp(body.email).then(() => ({ sent: true }));
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Paso 2 reset: verificar código y cambiar contraseña' })
  resetPassword(
    @Body() body: { email: string; code: string; newPassword: string },
  ) {
    return this.auth.resetPassword(body).then(() => ({ ok: true }));
  }

  @Delete('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar mi cuenta y todos mis datos' })
  deleteMe(@Request() req) {
    return this.auth.deleteMyAccount(req.user.id);
  }

  @Get('frontend-access')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Rutas de frontend permitidas para el usuario actual',
  })
  frontendAccess(@Request() req) {
    return this.auth.getFrontendAccess(req.user.id, req.user.roles ?? []);
  }
}
