import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ActivityStatus } from '@prisma/client';

export class UpdateActivityStatusDto {
  @ApiProperty({ enum: ActivityStatus, description: 'Target activity status' })
  @IsEnum(ActivityStatus)
  status: ActivityStatus;

  @ApiPropertyOptional({ description: 'Optional note or remark for this status update' })
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  remarks?: string;
}
