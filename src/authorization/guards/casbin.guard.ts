import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AUTHZ_ENFORCER } from 'nest-authz';
import { Enforcer } from 'casbin';
import { Request } from 'express';

@Injectable()
export class CasbinGuard implements CanActivate {
  constructor(@Inject(AUTHZ_ENFORCER) private enforcer: Enforcer) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const { user, method, route, originalUrl } = req as any;

    if (!user) throw new UnauthorizedException();

    // Siempre usar route.path para que el patrón keyMatch2 /:id funcione correctamente
    const resource = route?.path ?? originalUrl;

    const roles: string[] = user.roles ?? [];
    for (const role of roles) {
      const allowed = await this.enforcer.enforce(role, resource, method);
      if (allowed) return true;
    }

    throw new ForbiddenException('No tenés permisos para esta acción');
  }
}
