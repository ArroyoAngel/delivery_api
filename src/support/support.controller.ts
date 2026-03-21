import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { CasbinGuard } from '../authorization/guards/casbin.guard';
import { SupportService } from './support.service';

@ApiTags('Soporte')
@Controller('support')
@UseGuards(AuthGuard('jwt'), CasbinGuard)
@ApiBearerAuth()
export class SupportController {
  constructor(private readonly service: SupportService) {}

  @Post('tickets')
  @ApiOperation({ summary: 'Crear ticket de soporte' })
  create(
    @Request() req: any,
    @Body() body: { subject: string; message: string },
  ) {
    return this.service.createTicket(req.user.id, body.subject, body.message);
  }

  @Get('tickets')
  @ApiOperation({ summary: 'Mis tickets de soporte' })
  mine(@Request() req: any) {
    return this.service.getMyTickets(req.user.id);
  }

  @Get('admin/tickets')
  @ApiOperation({ summary: '(SA) Todos los tickets' })
  all(
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.service.getAllTickets(Number(limit) || 100, status);
  }

  @Patch('admin/tickets/:id')
  @ApiOperation({ summary: '(SA) Actualizar estado/notas de un ticket' })
  update(
    @Param('id') id: string,
    @Body() body: { status: string; adminNotes?: string },
  ) {
    return this.service.updateTicket(id, body.status, body.adminNotes);
  }
}
