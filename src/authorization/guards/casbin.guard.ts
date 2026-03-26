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
  private _lastReload = 0;
  private readonly _reloadCooldownMs = 60_000; // recargar máx 1 vez por minuto

  constructor(@Inject(AUTHZ_ENFORCER) private enforcer: Enforcer) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const { user, method, route, originalUrl } = req as any;

    if (!user) throw new UnauthorizedException();

    // Siempre usar route.path para que el patrón keyMatch2 /:id funcione correctamente
    const resource = route?.path ?? originalUrl;

    const roles: string[] = user.roles ?? [];
    for (const role of roles) {
      let allowed = await this.enforcer.enforce(role, resource, method);
      if (!allowed) {
        // Si falló, recargamos políticas (máx 1 vez por minuto) por si hubo seeds nuevos
        const now = Date.now();
        if (now - this._lastReload > this._reloadCooldownMs) {
          this._lastReload = now;
          await this.enforcer.loadPolicy();
          allowed = await this.enforcer.enforce(role, resource, method);
        }
      }
      if (allowed) return true;
    }

    throw new ForbiddenException('No tenés permisos para esta acción');
  }
}
