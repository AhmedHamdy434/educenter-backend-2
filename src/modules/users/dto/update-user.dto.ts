import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class UpdateUserDto {
  @ApiPropertyOptional({
    description: 'الاسم الكامل الجديد للمستخدم',
    example: 'محمود عبد الرحمن',
  })
  @IsOptional()
  @IsString({ message: 'الاسم يجب أن يكون نصاً.' })
  readonly fullName?: string;

  @ApiPropertyOptional({
    description: 'البريد الإلكتروني الجديد',
    example: 'mahmoud@example.com',
  })
  @IsOptional()
  @IsEmail({}, { message: 'صيغة البريد الإلكتروني غير صحيحة.' })
  readonly email?: string;

  @ApiPropertyOptional({
    description: 'كلمة المرور الجديدة (6 أحرف على الأقل)',
    example: 'NewSecret123',
    minLength: 6,
  })
  @IsOptional()
  @IsString({ message: 'كلمة المرور يجب أن تكون نصاً.' })
  @MinLength(6, { message: 'كلمة المرور يجب ألا تقل عن 6 أحرف.' })
  readonly password?: string;

  @ApiPropertyOptional({
    description: 'رقم الهاتف الجديد',
    example: '01122334455',
  })
  @IsOptional()
  @IsString({ message: 'رقم الهاتف يجب أن يكون نصاً.' })
  readonly phone?: string;

  @ApiPropertyOptional({
    description: 'رابط الصورة الشخصية (avatar)',
    example: 'https://res.cloudinary.com/demo/image/upload/avatar.jpg',
  })
  @IsOptional()
  @IsString({ message: 'رابط الصورة يجب أن يكون نصاً.' })
  readonly avatar?: string;

  @ApiPropertyOptional({
    description: 'تغيير حالة تفعيل الحساب (true للتفعيل، false للتعطيل)',
    example: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'حالة التفعيل يجب أن تكون قيمة منطقية.' })
  readonly isActive?: boolean;

  @ApiPropertyOptional({
    description: 'إلزام المستخدم بتغيير كلمة المرور عند تسجيل الدخول القادم',
    example: true,
  })
  @IsOptional()
  @IsBoolean({
    message: 'حالة إلزام تغيير كلمة المرور يجب أن تكون قيمة منطقية.',
  })
  readonly mustChangePassword?: boolean;
}
