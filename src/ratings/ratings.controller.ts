import { Body, Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { RatingsService } from './ratings.service';
import type { SubmitRatingDto } from './ratings.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CasbinGuard } from '../authorization/guards/casbin.guard';

@Controller('ratings')
@UseGuards(JwtAuthGuard, CasbinGuard)
export class RatingsController {
  constructor(private readonly service: RatingsService) {}

  @Post()
  submit(@Request() req: any, @Body() body: SubmitRatingDto) {
    return this.service.submit(req.user.id, body);
  }

  @Get('pending/:orderId')
  getPending(@Request() req: any, @Param('orderId') orderId: string) {
    return this.service.getPending(req.user.id, orderId);
  }

  @Get('my-pending')
  getMyPending(@Request() req: any) {
    return this.service.getMyPendingOrders(req.user.id);
  }
}
