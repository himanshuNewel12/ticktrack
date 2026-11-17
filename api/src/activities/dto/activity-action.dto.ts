import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/** Shared body for the complete / cancel actions. */
export class ActivityActionDto {
  @ApiPropertyOptional({ description: 'Optional note recorded against the action' })
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  remarks?: string;

  @ApiPropertyOptional({
    description: 'Series cancel only: one occurrence to keep as a standalone one-off instead of cancelling it',
  })
  @IsOptional()
  @IsUUID()
  keepActivityId?: string;
}
