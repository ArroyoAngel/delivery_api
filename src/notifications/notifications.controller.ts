import { Controller, Post, Delete, Body, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post('token')
  @ApiOperation({ summary: 'Registrar token FCM del dispositivo' })
  register(
    @Request() req: any,
    @Body() body: { token: string; platform?: string },
  ) {
    return this.notifications.registerToken(
      req.user.id,
      body.token,
      body.platform ?? 'android',
    );
  }

  @Delete('token')
  @ApiOperation({ summary: 'Eliminar todos los tokens FCM del usuario autenticado (logout)' })
  unregister(@Request() req: any) {
    return this.notifications.unregisterAllForUser(req.user.id);
  }
}
