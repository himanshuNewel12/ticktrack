import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AppCrashLogsController } from './app-crash-logs.controller';
import { AppCrashLogsService } from './app-crash-logs.service';

@Module({
  imports: [PrismaModule],
  controllers: [AppCrashLogsController],
  providers: [AppCrashLogsService],
})
export class AppCrashLogsModule {}
