import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CasbinGuard } from '../authorization/guards/casbin.guard';
import { RolesService } from './roles.service';

@ApiTags('Roles')
@Controller('roles')
@UseGuards(AuthGuard('jwt'), CasbinGuard)
@ApiBearerAuth()
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get('permissions')
  @ApiOperation({ summary: 'Permisos de frontend por rol del sistema' })
  getPermissions() {
    return this.roles.getPermissions();
  }

  @Put(':role/permissions')
  @ApiOperation({ summary: 'Actualizar rutas de frontend para un rol' })
  updatePermissions(
    @Param('role') role: string,
    @Body('routes') routes: string[],
  ) {
    return this.roles.updatePermissions(role, routes ?? []);
  }
}
