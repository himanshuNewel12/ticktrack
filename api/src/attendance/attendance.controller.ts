import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AttendanceService } from './attendance.service';
import { CheckInDto, CheckOutDto } from './dto/attendance.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, PermissionsGuard } from '../auth/guards/rbac.guard';
import { Permissions } from '../auth/decorators/rbac.decorator';
import { Permission } from '../auth/constants/rbac.constants';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Attendance')
@ApiBearerAuth()
@Controller({ path: 'attendance', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get('today')
  @Permissions(Permission.ATTENDANCE_READ, Permission.ATTENDANCE_MARK)
  @ApiOperation({ summary: "Get the current user's attendance status for today" })
  getTodayStatus(
    @CurrentUser('userId') userId: string,
    @Query('timeZone') timeZone?: string,
  ) {
    return this.attendanceService.getTodayStatus(userId, timeZone);
  }

  @Post('check-in')
  @Permissions(Permission.ATTENDANCE_MARK)
  @ApiOperation({ summary: 'Check in to mark the start of the workday' })
  checkIn(@CurrentUser('userId') userId: string, @Body() dto: CheckInDto) {
    return this.attendanceService.checkIn(userId, dto);
  }

  @Post('check-out')
  @Permissions(Permission.ATTENDANCE_MARK)
  @ApiOperation({ summary: 'Check out to mark the end of the workday' })
  checkOut(@CurrentUser('userId') userId: string, @Body() dto: CheckOutDto) {
    return this.attendanceService.checkOut(userId, dto);
  }
}
