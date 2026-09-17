import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateGradeDto {
  @IsNotEmpty({ message: 'اسم المرحلة الدراسية مطلوب.' })
  @IsString({ message: 'يجب أن يكون الاسم نصاً.' })
  @MaxLength(100, { message: 'يجب ألا يتجاوز الاسم 100 حرف.' })
  readonly name: string;

  @IsOptional()
  @IsString({ message: 'يجب أن يكون الوصف نصاً.' })
  readonly description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'يجب أن يكون الترتيب رقماً صحيحاً.' })
  @Min(0, { message: 'يجب ألا يقل الترتيب عن 0.' })
  readonly order?: number = 0;
}
