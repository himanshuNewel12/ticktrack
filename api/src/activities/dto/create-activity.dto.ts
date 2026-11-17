import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsDateString,
  IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, IsUUID,
} from 'class-validator';
import { VOICE_FILE_PATTERN } from '../activity-voice.service';

export class CreateActivityDto {
  /**
   * What the activity is.
   * @example "Prepare sprint demo deck"
   */
  @ApiProperty({ description: 'Activity name' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ description: 'Optional longer note' })
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  description?: string;

  @ApiPropertyOptional({ description: 'Voice-note description — file name returned by POST /activities/voice' })
  @IsOptional()
  @Matches(VOICE_FILE_PATTERN, { message: 'descriptionAudioFile is not a valid voice note' })
  descriptionAudioFile?: string;

  @ApiPropertyOptional({ description: 'Length of the voice note in seconds' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(600)
  descriptionAudioSec?: number;

  /**
   * Users the activity is assigned to. Omit (or send only your own id) to keep
   * it personal — the creator is always able to see and act on it.
   */
  @ApiPropertyOptional({ description: 'Assignee user ids', type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  assigneeIds?: string[];

  @ApiPropertyOptional({ description: 'Informer user ids — told when the activity is completed or cancelled', type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  informerIds?: string[];

  @ApiPropertyOptional({ description: 'Escalator user ids — people who may escalate the activity', type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  escalatorIds?: string[];

  /** User who asked for this activity, when it is logged on their behalf. */
  @ApiPropertyOptional({ description: 'User id of who assigned the activity' })
  @IsOptional()
  @IsUUID('4')
  assignedById?: string;

  /**
   * Start of the activity window, as an ISO date-time.
   * @example "2026-08-03T09:30:00.000Z"
   */
  @ApiProperty({ description: 'Start date-time (ISO)' })
  @IsDateString()
  startAt!: string;

  @ApiProperty({ description: 'End date-time (ISO)' })
  @IsDateString()
  endAt!: string;

  /** When true the window is normalised to cover the whole day. */
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  allDay?: boolean;
}
