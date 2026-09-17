import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Length,
  MinLength,
} from 'class-validator';

export class ResetPasswordDto {
  @IsNotEmpty({ message: 'البريد الإلكتروني مطلوب.' })
  @IsEmail({}, { message: 'صيغة البريد الإلكتروني غير صحيحة.' })
  readonly email: string;

  @IsNotEmpty({ message: 'رمز التحقق مطلوب.' })
  @IsString({ message: 'رمز التحقق يجب أن يكون نصاً.' })
  @Length(6, 6, { message: 'رمز التحقق يجب أن يتكون من 6 أرقام.' })
  readonly otp: string;

  @IsNotEmpty({ message: 'كلمة المرور الجديدة مطلوبة.' })
  @IsString({ message: 'كلمة المرور الجديدة يجب أن تكون نصاً.' })
  @MinLength(6, { message: 'كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف.' })
  readonly newPassword: string;
}
