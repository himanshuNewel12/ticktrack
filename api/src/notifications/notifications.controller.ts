import { Controller, Get, Patch, Put, Param, Body, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('user-alerts')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get a list of the current user notifications with an optional limit and scope' })
  async getNotifications(
    @CurrentUser('id') userId: string,
    @Query('limit') limit?: string,
    @Query('scope') scope?: string,
  ) {
    return this.notificationsService.getAll(userId, limit ? parseInt(limit) : 20, scope);
  }

  // Static path, declared ahead of ':id/read'.
  @Patch('mark-all-read')
  @ApiOperation({ summary: 'Mark all of the current user notifications as read' })
  async markAllRead(@CurrentUser('id') userId: string) {
    return this.notificationsService.markAllRead(userId);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a single notification as read by ID' })
  async markRead(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.notificationsService.markRead(id, userId);
  }

  @Put('push-token')
  @ApiOperation({ summary: 'Register Expo push notification token for mobile device' })
  async updatePushToken(
    @CurrentUser('id') userId: string,
    @Body() body: { pushToken: string },
  ) {
    return this.notificationsService.updatePushToken(userId, body?.pushToken ?? null);
  }
}
