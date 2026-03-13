import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UsersService } from './users.service';
import { CasbinGuard } from '../authorization/guards/casbin.guard';

@Controller('users')
@UseGuards(AuthGuard('jwt'), CasbinGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  findAll() {
    return this.users.findAll();
  }

  @Put(':id/roles')
  updateRoles(@Param('id') id: string, @Body('roles') roles: string[]) {
    return this.users.updateRoles(id, roles);
  }
}
