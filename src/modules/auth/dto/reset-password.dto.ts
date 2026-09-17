import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Length,
  MinLength,
} from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({
    description: 'البريد الإلكتروني الذي استقبل رمز التحقق',
    example: 'user@example.com',
  })
  @IsNotEmpty({ message: 'البريد الإلكتروني مطلوب.' })
  @IsEmail({}, { message: 'صيغة البريد الإلكتروني غير صحيحة.' })
  readonly email!: string;

  @ApiProperty({
    description: 'رمز التحقق (OTP) المكون من 6 أرقام',
    example: '123456',
    minLength: 6,
    maxLength: 6,
  })
  @IsNotEmpty({ message: 'رمز التحقق مطلوب.' })
  @IsString({ message: 'رمز التحقق يجب أن يكون نصاً.' })
  @Length(6, 6, { message: 'رمز التحقق يجب أن يتكون من 6 أرقام.' })
  readonly otp!: string;

  @ApiProperty({
    description: 'كلمة المرور الجديدة (6 أحرف على الأقل)',
    example: 'NewP@ssword123',
    minLength: 6,
  })
  @IsNotEmpty({ message: 'كلمة المرور الجديدة مطلوبة.' })
  @IsString({ message: 'كلمة المرور الجديدة يجب أن تكون نصاً.' })
  @MinLength(6, { message: 'كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف.' })
  readonly newPassword!: string;
}
