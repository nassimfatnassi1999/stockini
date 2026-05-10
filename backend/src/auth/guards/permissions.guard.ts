import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators';
import { AuthUser } from '../../common/decorators/current-user.decorator';

const SUPER_ROLES = ['SUPER_ADMIN', 'ADMIN', 'super_admin', 'admin'];

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;
    if (!user) return false;

    if (SUPER_ROLES.includes(user.role)) return true;

    const perms = user.permissions ?? [];
    if (perms.includes('*')) return true;

    return required.every((perm) => {
      if (perms.includes(perm)) return true;
      const module = perm.split('.')[0];
      return perms.includes(`${module}.*`);
    });
  }
}
