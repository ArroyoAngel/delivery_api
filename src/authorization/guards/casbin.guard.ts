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
  private _reloading: Promise<void> | null = null;

  constructor(@Inject(AUTHZ_ENFORCER) private enforcer: Enforcer) {}

  private async _reloadIfNeeded(): Promise<void> {
    // Si ya hay un reload en curso, esperar a que termine en lugar de saltarlo
    if (this._reloading) {
      await this._reloading;
      return;
    }
    const now = Date.now();
    if (now - this._lastReload <= this._reloadCooldownMs) return;

    this._reloading = this.enforcer.loadPolicy().finally(() => {
      this._lastReload = Date.now();
      this._reloading = null;
    });
    await this._reloading;
  }

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
        // Si falló, recargar políticas esperando a que termine antes de re-evaluar
        await this._reloadIfNeeded();
        allowed = await this.enforcer.enforce(role, resource, method);
      }
      if (allowed) return true;
    }

    throw new ForbiddenException('No tenés permisos para esta acción');
  }
}
