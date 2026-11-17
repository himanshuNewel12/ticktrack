import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class CheckInDto {
  /**
   * Optional free-text note the employee adds when checking in.
   * @example "Starting early to cover the client call"
   */
  @IsString()
  @IsOptional()
  remarks?: string;

  /**
   * Whether the check-in is for a work-from-home day.
   * @example true
   */
  @IsBoolean()
  @IsOptional()
  isWfh?: boolean;

  /**
   * IANA time zone used to interpret the check-in timestamp.
   * @example "Asia/Kolkata"
   */
  @IsString()
  @IsOptional()
  timeZone?: string;
}

export class CheckOutDto {
  /**
   * Optional free-text note the employee adds when checking out.
   * @example "Wrapped up the sprint tasks"
   */
  @IsString()
  @IsOptional()
  remarks?: string;

  /**
   * IANA time zone used to interpret the check-out timestamp.
   * @example "Asia/Kolkata"
   */
  @IsString()
  @IsOptional()
  timeZone?: string;
}
