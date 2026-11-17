import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!requiredRoles.some((role) => user?.role === role)) {
      throw new ForbiddenException(
        `Role '${user?.role}' does not have access. Required: ${requiredRoles.join(', ')}`,
      );
    }
    return true;
  }
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      'permissions',
      [context.getHandler(), context.getClass()],
    );
    if (!requiredPermissions || requiredPermissions.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    const userPermissions: string[] = user?.permissions ?? [];
    const hasPermission = requiredPermissions.some(
      (p) => userPermissions.includes(p),
    );
    if (!hasPermission) {
      throw new ForbiddenException(
        `Missing required permission. Required one of: ${requiredPermissions.join(', ')}`,
      );
    }
    return true;
  }
}
