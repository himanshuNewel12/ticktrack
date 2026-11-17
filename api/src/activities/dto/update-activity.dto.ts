import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsDateString,
  IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, IsUUID,
} from 'class-validator';
import { VOICE_FILE_PATTERN } from '../activity-voice.service';

export class UpdateActivityDto {
  @ApiPropertyOptional({ description: 'Activity name' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

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

  @ApiPropertyOptional({ description: 'Remove the existing voice-note description' })
  @IsOptional()
  @IsBoolean()
  removeDescriptionAudio?: boolean;

  @ApiPropertyOptional({ description: 'Assignee user ids', type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  assigneeIds?: string[];

  @ApiPropertyOptional({ description: 'Informer user ids (replaces the full set)', type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  informerIds?: string[];

  @ApiPropertyOptional({ description: 'Escalator user ids (replaces the full set)', type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  escalatorIds?: string[];

  @ApiPropertyOptional({ description: 'User id of who assigned the activity' })
  @IsOptional()
  @IsUUID('4')
  assignedById?: string;

  @ApiPropertyOptional({ description: 'Start date-time (ISO)' })
  @IsOptional()
  @IsDateString()
  startAt?: string;

  @ApiPropertyOptional({ description: 'End date-time (ISO)' })
  @IsOptional()
  @IsDateString()
  endAt?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  allDay?: boolean;
}
