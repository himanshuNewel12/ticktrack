import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsDateString, IsEnum, IsInt,
  IsOptional, IsString, Max, MaxLength, Min, MinLength, IsUUID,
} from 'class-validator';
import { RecurrenceFrequency } from '@prisma/client';

/**
 * Creates a repeating to-do. `startAt` / `endAt` describe the *first* window;
 * its time-of-day and duration are copied onto every generated occurrence.
 */
export class CreateRecurringActivityDto {
  @ApiProperty({ description: 'Activity name, reused for every occurrence' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ description: 'Optional longer note' })
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  description?: string;

  @ApiPropertyOptional({ description: 'Assignee user ids', type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  assigneeIds?: string[];

  /**
   * Start of the first occurrence's window.
   * @example "2026-08-11T09:30:00.000Z"
   */
  @ApiProperty({ description: 'First occurrence start date-time (ISO)' })
  @IsDateString()
  startAt!: string;

  @ApiProperty({ description: 'First occurrence end date-time (ISO)' })
  @IsDateString()
  endAt!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  allDay?: boolean;

  @ApiProperty({ enum: RecurrenceFrequency, description: 'How often it repeats' })
  @IsEnum(RecurrenceFrequency)
  frequency!: RecurrenceFrequency;

  /** Repeat every N days / weeks / months. */
  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  interval?: number = 1;

  /**
   * WEEKLY only — 0=Sun … 6=Sat. Omit to repeat on the start date's weekday.
   * @example [1, 3, 5]
   */
  @ApiPropertyOptional({ description: 'Weekdays (0=Sun … 6=Sat)', type: [Number] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(7)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  byWeekday?: number[];

  /** MONTHLY only — clamped to the last day in shorter months. */
  @ApiPropertyOptional({ description: 'Day of month (1–31)', minimum: 1, maximum: 31 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  byMonthDay?: number;

  /** MONTHLY only — one or more days of month (1–31). */
  @ApiPropertyOptional({ description: 'Days of month (1–31)', type: [Number] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(31)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(31, { each: true })
  byMonthDays?: number[];

  /** Inclusive last date an occurrence may fall on. */
  @ApiPropertyOptional({ description: 'Repeat until this date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  seriesEndDate?: string;

  /** Alternative end condition — total occurrences the series may produce. */
  @ApiPropertyOptional({ description: 'Stop after this many occurrences', minimum: 1, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  maxOccurrences?: number;

  /**
   * Drops occurrences landing on a Saturday, Sunday or non-optional public
   * holiday. Skipped days do not count towards `maxOccurrences`.
   */
  @ApiPropertyOptional({ description: 'Skip weekends and public holidays', default: false })
  @IsOptional()
  @IsBoolean()
  skipNonWorkingDays?: boolean;
}

/**
 * Edits a series. Every field is optional; `startAt` / `endAt` are not editable
 * because the series anchor must stay put (past occurrences are tied to it).
 * Changing the rule regenerates the occurrences after today.
 */
export class UpdateRecurringActivityDto extends PartialType(
  OmitType(CreateRecurringActivityDto, ['startAt', 'endAt', 'allDay'] as const),
) {}

export class QueryRecurrencesDto {
  @ApiPropertyOptional({ description: 'Match against the series name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => parseInt(value, 10))
  page?: number = 1;

  @ApiPropertyOptional({ default: 6 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number = 6;
}
