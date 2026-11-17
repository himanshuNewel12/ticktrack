import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Matches, MaxLength, Min } from 'class-validator';

/** A file already uploaded through POST /files/upload. */
export class AttachmentDto {
  @ApiProperty({ description: 'S3 key returned by POST /files/upload' })
  @IsString()
  @Matches(/^users\/[\w-]+\/[\w.\- ]+$/, { message: 'attachment key is not valid' })
  key: string;

  @ApiProperty()
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  size: number;

  @ApiProperty()
  @IsString()
  @MaxLength(150)
  mimeType: string;
}
