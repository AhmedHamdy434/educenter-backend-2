import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString({ message: 'الاسم يجب أن يكون نصاً.' })
  readonly fullName?: string;

  @IsOptional()
  @IsEmail({}, { message: 'صيغة البريد الإلكتروني غير صحيحة.' })
  readonly email?: string;

  @IsOptional()
  @IsString({ message: 'كلمة المرور يجب أن تكون نصاً.' })
  @MinLength(6, { message: 'كلمة المرور يجب ألا تقل عن 6 أحرف.' })
  readonly password?: string;

  @IsOptional()
  @IsString({ message: 'رقم الهاتف يجب أن يكون نصاً.' })
  readonly phone?: string;

  @IsOptional()
  @IsString({ message: 'رابط الصورة يجب أن يكون نصاً.' })
  readonly avatar?: string;

  @IsOptional()
  @IsBoolean({ message: 'حالة التفعيل يجب أن تكون قيمة منطقية.' })
  readonly isActive?: boolean;

  @IsOptional()
  @IsBoolean({
    message: 'حالة إلزام تغيير كلمة المرور يجب أن تكون قيمة منطقية.',
  })
  readonly mustChangePassword?: boolean;
}
