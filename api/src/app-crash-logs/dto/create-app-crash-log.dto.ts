import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export const APP_CRASH_TYPES = [
  'JS_ERROR',
  'RENDER_CRASH',
  'UNHANDLED_REJECTION',
  'ABRUPT_EXIT',
  'BACKGROUND_KILL',
] as const;

export class CreateAppCrashLogDto {
  @ApiProperty({ enum: APP_CRASH_TYPES })
  @IsIn([...APP_CRASH_TYPES])
  type!: (typeof APP_CRASH_TYPES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  fatal?: boolean;

  @ApiProperty()
  @IsString()
  @MaxLength(2000)
  message!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(12000)
  stack?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(6000)
  componentStack?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  screen?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  userEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  appVersion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  platform?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  osVersion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  deviceBrand?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  deviceModel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  extra?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'When it happened on the device (ISO). Defaults to now.' })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}
