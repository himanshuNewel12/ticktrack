import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CheckInDto, CheckOutDto } from './dto/attendance.dto';
import {
  getUtcForZonedLocalDateTime,
  getZonedDateParts,
  getZonedDayRange,
  resolveTimeZone,
} from './time-zone.util';

/** Mobile app attendance: today's status, check-in and check-out only. */
@Injectable()
export class AttendanceService {
  constructor(
    private prisma: PrismaService,
  ) {}

  async getTodayStatus(userId: string, timeZone?: string) {
    const resolvedTimeZone = resolveTimeZone(timeZone);
    const now = new Date();
    const dayRange = getZonedDayRange(now, resolvedTimeZone);
    return this.findAttendanceInRange(userId, dayRange);
  }

  async checkIn(userId: string, dto: CheckInDto) {
    const timeZone = resolveTimeZone(dto.timeZone);
    const now = new Date();
    const dayRange = getZonedDayRange(now, timeZone);
    const dayParts = getZonedDateParts(now, timeZone);
    const existing = await this.findAttendanceInRange(userId, dayRange);
    if (existing) {
      throw new BadRequestException('Already checked in for today');
    }

    // Fetch user with shift info
    const userWithShift = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { shiftId: true, shift: true },
    });

    let attendanceStatus = 'PRESENT';
    let shiftId: string | undefined;

    if (userWithShift?.shift) {
      const shift = userWithShift.shift;
      shiftId = shift.id;
      // Parse shift start time "HH:mm"
      const [startH, startM] = shift.startTime.split(':').map(Number);
      const shiftStart = getUtcForZonedLocalDateTime(
        timeZone,
        dayParts.year,
        dayParts.month,
        dayParts.day,
        startH,
        startM + 15, // grace 15 min
      );
      if (now > shiftStart) {
        attendanceStatus = 'LATE';
      }
    } else {
      // Fallback: LATE if after 10:00 AM
      if (dayParts.hour >= 10) {
        attendanceStatus = 'LATE';
      }
    }

    return this.prisma.attendance.create({
      data: {
        userId,
        date: dayRange.start,
        checkIn: now,
        checkInTimeZone: timeZone,
        status: attendanceStatus,
        remarks: dto.remarks,
        isWfh: dto.isWfh ?? false,
        ...(shiftId ? { shiftId } : {}),
      },
    });
  }

  async checkOut(userId: string, dto: CheckOutDto) {
    const timeZone = resolveTimeZone(dto.timeZone);
    const record = await this.getTodayStatus(userId, timeZone);
    if (!record) {
      throw new BadRequestException('No check-in found for today');
    }
    if (record.checkOut) {
      throw new BadRequestException('Already checked out for today');
    }
    
    const now = new Date();
    let overtimeHours = 0;

    if (record.checkIn && record.shift) {
      const shift = record.shift;
      const workedMs = now.getTime() - record.checkIn.getTime();
      const workedHours = workedMs / 3600000 - shift.breakMinutes / 60;

      const [startH, startM] = shift.startTime.split(':').map(Number);
      const [endH, endM] = shift.endTime.split(':').map(Number);
      const shiftHours =
        (endH * 60 + endM - (startH * 60 + startM)) / 60 - shift.breakMinutes / 60;

      overtimeHours = Math.max(0, workedHours - shiftHours);
    }

    return this.prisma.attendance.update({
      where: { id: record.id },
      data: {
        checkOut: now,
        checkOutTimeZone: timeZone,
        overtimeHours: Math.round(overtimeHours * 100) / 100,
        remarks: dto.remarks
          ? `${record.remarks || ''} | Out: ${dto.remarks}`
          : record.remarks,
      },
    });
  }


  private findAttendanceInRange(
    userId: string,
    dayRange: { start: Date; end: Date },
  ) {
    return this.prisma.attendance.findFirst({
      where: {
        userId,
        date: {
          gte: dayRange.start,
          lt: dayRange.end,
        },
      },
      include: { shift: true },
    });
  }

}
