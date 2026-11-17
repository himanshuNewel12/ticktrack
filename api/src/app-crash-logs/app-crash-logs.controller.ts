import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AppCrashLogsService } from './app-crash-logs.service';
import { CreateAppCrashLogDto } from './dto/create-app-crash-log.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/rbac.guard';
import { Roles } from '../auth/decorators/rbac.decorator';
import { Role } from '../auth/constants/rbac.constants';

@ApiTags('AppCrashLogs')
@Controller('app-crash-logs')
export class AppCrashLogsController {
  constructor(private readonly service: AppCrashLogsService) {}

  // Deliberately unauthenticated: the app can crash before or without a login.
  // Throttled and size-limited by the DTO instead.
  @Post()
  @Throttle({ default: { limit: 30, ttl: 60 * 1000 } })
  @ApiOperation({ summary: 'Report a crash or error from the mobile app' })
  create(@Body() dto: CreateAppCrashLogDto, @Req() req: Request) {
    return this.service.create(dto, req.ip);
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List app crash logs (admin)' })
  list(
    @Query('type') type?: string,
    @Query('deviceModel') deviceModel?: string,
    @Query('userEmail') userEmail?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.list({ type, deviceModel, userEmail, page: Number(page), limit: Number(limit) });
  }
}
