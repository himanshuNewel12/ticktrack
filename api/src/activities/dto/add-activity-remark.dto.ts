import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { AttachmentDto } from './attachment.dto';
import { VOICE_FILE_PATTERN } from '../activity-voice.service';

/** Body for an assignee's remarks-only update — no status change. Needs text, a voice note, or both. */
export class AddActivityRemarkDto {
  @ApiPropertyOptional({ description: 'Remark or progress note to record against the activity' })
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  remarks?: string;

  @ApiPropertyOptional({ description: 'Voice-note remark — file name returned by POST /activities/voice' })
  @IsOptional()
  @Matches(VOICE_FILE_PATTERN, { message: 'audioFile is not a valid voice note' })
  audioFile?: string;

  @ApiPropertyOptional({ description: 'Length of the voice note in seconds' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(600)
  audioSec?: number;

  @ApiPropertyOptional({ type: [AttachmentDto], description: 'Files uploaded with POST /files/upload (max 5)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  attachments?: AttachmentDto[];
}
