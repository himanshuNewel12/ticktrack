import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ActivityStatus } from '@prisma/client';

export class QueryActivitiesDto {
  @ApiPropertyOptional({ enum: ActivityStatus, description: 'Filter by status' })
  @IsOptional()
  @IsEnum(ActivityStatus)
  status?: ActivityStatus;

  @ApiPropertyOptional({ description: 'Match against the activity name' })
  @IsOptional()
  @IsString()
  search?: string;

  /**
   * Keep activities whose window overlaps this date (inclusive). Combined with
   * `to` it forms a range; on its own it means "active on or after this date".
   * @example "2026-07-30"
   */
  @ApiPropertyOptional({ description: 'Window overlap — from date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Window overlap — to date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => parseInt(value, 10))
  page?: number = 1;

  @ApiPropertyOptional({ default: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number = 100;
}
