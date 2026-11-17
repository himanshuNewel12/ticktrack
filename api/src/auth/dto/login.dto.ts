import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, MinLength } from 'class-validator';

export class LoginDto {
  /**
   * Email address used to sign in to the account.
   * @example "jane.doe@newel.com"
   */
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase().trim() : value))
  @IsEmail()
  @IsNotEmpty()
  email: string;

  /**
   * Account password used for authentication.
   * @example "S3cureP@ss"
   */
  @IsNotEmpty()
  @MinLength(4)
  password: string;
}
