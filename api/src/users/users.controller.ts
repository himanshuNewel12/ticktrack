import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, PermissionsGuard } from '../auth/guards/rbac.guard';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth()
@Controller({ path: 'users', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  // Active users assignable to activities (workforce roles). Open to any authenticated user.
  @Get('assignable')
  @ApiOperation({ summary: 'Active users that can be assigned to an activity' })
  findAssignable() {
    return this.usersService.findAssignableUsers();
  }
}
