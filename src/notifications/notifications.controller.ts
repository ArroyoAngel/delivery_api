import {
  Controller,
  Post,
  Delete,
  Get,
  Patch,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  // ── Token ────────────────────────────────────────────────────────────────

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
  @ApiOperation({
    summary: 'Eliminar todos los tokens FCM del usuario (logout)',
  })
  unregister(@Request() req: any) {
    return this.notifications.unregisterAllForUser(req.user.id);
  }

  // ── History ──────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Obtener notificaciones del usuario autenticado' })
  list(
    @Request() req: any,
    @Query('unread') unread?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notifications.getUserNotifications(
      req.user.id,
      limit ? parseInt(limit) : 30,
      unread === 'true',
    );
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Cantidad de notificaciones no leídas' })
  async unreadCount(@Request() req: any) {
    const count = await this.notifications.getUnreadCount(req.user.id);
    return { count };
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Marcar todas las notificaciones como leídas' })
  readAll(@Request() req: any) {
    return this.notifications.markAllRead(req.user.id);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Marcar una notificación como leída' })
  read(@Param('id') id: string, @Request() req: any) {
    return this.notifications.markRead(id, req.user.id);
  }
}
