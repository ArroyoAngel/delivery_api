import { Body, Controller, Get, Param, Patch, Put, Request, UseGuards } from '@nestjs/common';
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

  /** Actualiza el perfil propio (teléfono, nombre). Disponible para todos los roles. */
  @Patch('profile')
  updateMyProfile(
    @Request() req: any,
    @Body() body: { phone?: string; firstName?: string; lastName?: string },
  ) {
    return this.users.updateMyProfile(req.user.id, body);
  }
}
