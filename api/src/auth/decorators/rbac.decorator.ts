import { SetMetadata } from '@nestjs/common';
import { Role, Permission } from '../constants/rbac.constants';

export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);
export const Permissions = (...permissions: Permission[]) =>
  SetMetadata('permissions', permissions);
