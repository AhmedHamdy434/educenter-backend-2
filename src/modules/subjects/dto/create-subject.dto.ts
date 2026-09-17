import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSubjectDto {
  @IsNotEmpty({ message: 'اسم المادة الدراسية مطلوب.' })
  @IsString({ message: 'يجب أن يكون الاسم نصاً.' })
  @MaxLength(100, { message: 'يجب ألا يتجاوز الاسم 100 حرف.' })
  readonly name: string;

  @IsOptional()
  @IsString({ message: 'يجب أن يكون الوصف نصاً.' })
  readonly description?: string;

  @IsNotEmpty({ message: 'معرف المرحلة الدراسية مطلوب.' })
  @IsString({ message: 'يجب أن يكون معرف المرحلة نصاً.' })
  readonly gradeId: string;
}
