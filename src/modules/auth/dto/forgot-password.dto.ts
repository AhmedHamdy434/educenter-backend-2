import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({
    description: 'البريد الإلكتروني المسجل في النظام لإرسال رمز التحقق (OTP)',
    example: 'user@example.com',
  })
  @IsNotEmpty({ message: 'البريد الإلكتروني مطلوب.' })
  @IsEmail({}, { message: 'صيغة البريد الإلكتروني غير صحيحة.' })
  readonly email!: string;
}
