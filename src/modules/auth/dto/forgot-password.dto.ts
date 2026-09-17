import { IsEmail, IsNotEmpty } from 'class-validator';

export class ForgotPasswordDto {
  @IsNotEmpty({ message: 'البريد الإلكتروني مطلوب.' })
  @IsEmail({}, { message: 'صيغة البريد الإلكتروني غير صحيحة.' })
  readonly email: string;
}
