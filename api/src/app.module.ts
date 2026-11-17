import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ActivitiesModule } from './activities/activities.module';
import { AttendanceModule } from './attendance/attendance.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ListsModule } from './lists/lists.module';
import { FilesModule } from './files/files.module';
import { AppCrashLogsModule } from './app-crash-logs/app-crash-logs.module';

/**
 * API for the mobile app (../application).
 *
 * Shares the PostgreSQL database and Prisma schema with the main backend
 * (../backend/prisma/schema.prisma). Deliberately has no ScheduleModule: every
 * cron job stays in the main backend so nothing runs twice against the shared DB.
 */
@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [`.env.${process.env.NODE_ENV || 'development'}`, '.env'],
      expandVariables: true,
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    ActivitiesModule,
    AttendanceModule,
    NotificationsModule,
    ListsModule,
    FilesModule,
    AppCrashLogsModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
