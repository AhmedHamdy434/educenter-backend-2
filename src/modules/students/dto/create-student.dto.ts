import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateStudentDto {
  @IsNotEmpty({ message: 'الاسم الكامل مطلوب.' })
  @IsString({ message: 'يجب أن يكون الاسم نصاً.' })
  readonly fullName: string;

  @IsNotEmpty({ message: 'البريد الإلكتروني مطلوب.' })
  @IsEmail({}, { message: 'يجب إدخال بريد إلكتروني صالح.' })
  readonly email: string;

  @IsNotEmpty({ message: 'كلمة المرور مطلوبة.' })
  @IsString({ message: 'يجب أن تكون كلمة المرور نصاً.' })
  @MinLength(6, { message: 'يجب ألا تقل كلمة المرور عن 6 أحرف.' })
  readonly password: string;

  @IsOptional()
  @IsString({ message: 'يجب أن يكون رقم الهاتف نصاً.' })
  readonly phone?: string;

  @IsOptional()
  @IsString({ message: 'يجب أن يكون مسار الصورة نصاً.' })
  readonly avatar?: string;

  @IsOptional()
  @IsString({ message: 'يجب أن يكون رقم هاتف ولي الأمر نصاً.' })
  readonly parentPhone?: string;

  @IsOptional()
  @IsString({ message: 'يجب أن تكون الملاحظات نصاً.' })
  readonly notes?: string;

  @IsNotEmpty({ message: 'المرحلة الدراسية مطلوبة.' })
  @IsString({ message: 'يجب أن يكون معرف المرحلة الدراسية نصاً.' })
  readonly gradeId: string;
}
