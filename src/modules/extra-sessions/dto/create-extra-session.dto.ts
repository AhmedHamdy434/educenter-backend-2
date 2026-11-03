import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ExtraSessionAudience, ExtraSessionType } from '@prisma/client';

export class CreateExtraSessionDto {
  @IsOptional()
  @IsString({ message: 'عنوان الحصة يجب أن يكون نصاً صالحاً.' })
  readonly title?: string;

  @IsOptional()
  @IsEnum(ExtraSessionType, { message: 'نوع الحصة الإضافية غير صالح.' })
  readonly type?: ExtraSessionType = ExtraSessionType.OTHER;

  @IsOptional()
  @IsEnum(ExtraSessionAudience, { message: 'الجمهور المستهدف غير صالح.' })
  readonly audience?: ExtraSessionAudience = ExtraSessionAudience.ALL_GROUP;

  @IsNotEmpty({ message: 'تاريخ الحصة مطلوب.' })
  @IsString({ message: 'تاريخ الحصة يجب أن يكون نصاً بتنسيق YYYY-MM-DD.' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'تاريخ الحصة يجب أن يكون بصيغة YYYY-MM-DD.',
  })
  readonly date!: string;

  @IsNotEmpty({ message: 'ساعة الحصة مطلوبة.' })
  @Type(() => Number)
  @IsInt({ message: 'ساعة الحصة يجب أن تكون عدداً صحيحاً.' })
  @Min(0, { message: 'ساعة الحصة لا يمكن أن تقل عن 0.' })
  @Max(23, { message: 'ساعة الحصة لا يمكن أن تزيد عن 23.' })
  readonly hour!: number;

  @IsNotEmpty({ message: 'دقيقة الحصة مطلوبة.' })
  @Type(() => Number)
  @IsInt({ message: 'دقيقة الحصة يجب أن تكون عدداً صحيحاً.' })
  @Min(0, { message: 'دقيقة الحصة لا يمكن أن تقل عن 0.' })
  @Max(59, { message: 'دقيقة الحصة لا يمكن أن تزيد عن 59.' })
  readonly minute!: number;

  @IsOptional()
  @IsString({ message: 'مكان الحصة يجب أن يكون نصاً صالحاً.' })
  readonly location?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'سعر الحصة يجب أن يكون رقماً صالحاً.' })
  @Min(0, { message: 'سعر الحصة لا يمكن أن يكون سالباً.' })
  readonly fee?: number = 0;

  @IsOptional()
  @IsString({ message: 'الملاحظات يجب أن تكون نصاً صالحاً.' })
  readonly notes?: string;

  @IsOptional()
  @IsArray({ message: 'معرفات الطلاب يجب أن تكون مصفوفة صالحة.' })
  @IsString({ each: true, message: 'كل معرف طالب يجب أن يكون نصاً صالحاً.' })
  readonly studentIds?: string[];
}
