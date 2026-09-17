import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateTeacherDto {
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
  @IsString({ message: 'يجب أن يكون التخصص نصاً.' })
  readonly specialization?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'يجب أن يكون الراتب رقماً.' })
  @Min(0, { message: 'يجب ألا يقل الراتب عن 0.' })
  readonly salary?: number;

  @IsOptional()
  @IsString({ message: 'يجب أن تكون النبذة التعريفية نصاً.' })
  readonly bio?: string;

  @IsOptional()
  @IsArray({ message: 'يجب أن تكون المواد مصفوفة.' })
  @IsString({ each: true, message: 'يجب أن يكون معرف المادة نصاً.' })
  readonly subjectIds?: string[];
}
