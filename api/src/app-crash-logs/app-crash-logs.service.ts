import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAppCrashLogDto } from './dto/create-app-crash-log.dto';

@Injectable()
export class AppCrashLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateAppCrashLogDto, ipAddress?: string) {
    const { occurredAt, extra, ...rest } = dto;
    const row = await this.prisma.appCrashLog.create({
      data: {
        ...rest,
        fatal: dto.fatal ?? false,
        extra: (extra as Prisma.InputJsonValue) ?? undefined,
        ipAddress: ipAddress ?? null,
        occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
      },
      select: { id: true },
    });
    return { id: row.id };
  }

  async list(query: { type?: string; deviceModel?: string; userEmail?: string; page?: number; limit?: number }) {
    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
    const page = Math.max(Number(query.page) || 1, 1);
    const where: Prisma.AppCrashLogWhereInput = {
      ...(query.type ? { type: query.type } : {}),
      ...(query.deviceModel ? { deviceModel: { contains: query.deviceModel, mode: 'insensitive' } } : {}),
      ...(query.userEmail ? { userEmail: { contains: query.userEmail, mode: 'insensitive' } } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.appCrashLog.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.appCrashLog.count({ where }),
    ]);
    return { data, total, page, limit };
  }
}
