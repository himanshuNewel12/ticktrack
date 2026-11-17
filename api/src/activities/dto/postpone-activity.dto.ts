import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { VOICE_FILE_PATTERN } from '../activity-voice.service';

export class PostponeActivityDto {
  /**
   * The new start of the window. Postponing always moves the activity to a new
   * window rather than nudging it by a fixed amount.
   * @example "2026-08-05T09:30:00.000Z"
   */
  @ApiProperty({ description: 'New start date-time (ISO)' })
  @IsDateString()
  startAt!: string;

  @ApiProperty({ description: 'New end date-time (ISO)' })
  @IsDateString()
  endAt!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  allDay?: boolean;

  @ApiPropertyOptional({ description: 'Why it moved — shown to assignees' })
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  remarks?: string;

  @ApiPropertyOptional({ description: 'Voice-note reason — file name returned by POST /activities/voice' })
  @IsOptional()
  @Matches(VOICE_FILE_PATTERN, { message: 'audioFile is not a valid voice note' })
  audioFile?: string;

  @ApiPropertyOptional({ description: 'Length of the voice note in seconds' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(600)
  audioSec?: number;
}
