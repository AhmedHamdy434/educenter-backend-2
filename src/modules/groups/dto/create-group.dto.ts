import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
  IsNumber,
  IsDateString,
} from 'class-validator';
import { DayOfWeek } from '@prisma/client';

export class GroupScheduleDto {
  @IsNotEmpty({ message: 'اليوم مطلوب.' })
  @IsEnum(DayOfWeek, { message: 'يجب اختيار يوم صحيح من أيام الأسبوع.' })
  readonly day: DayOfWeek;

  @IsNotEmpty({ message: 'الساعة مطلوبة.' })
  @Type(() => Number)
  @IsInt({ message: 'يجب أن تكون الساعة رقماً صحيحاً.' })
  @Min(0, { message: 'يجب ألا تقل الساعة عن 0.' })
  @Max(23, { message: 'يجب ألا تزيد الساعة عن 23.' })
  readonly hour: number;

  @IsNotEmpty({ message: 'الدقيقة مطلوبة.' })
  @Type(() => Number)
  @IsInt({ message: 'يجب أن تكون الدقيقة رقماً صحيحاً.' })
  @Min(0, { message: 'يجب ألا تقل الدقيقة عن 0.' })
  @Max(59, { message: 'يجب ألا تزيد الدقيقة عن 59.' })
  readonly minute: number;
}

export class CreateGroupDto {
  @IsNotEmpty({ message: 'اسم المجموعة مطلوب.' })
  @IsString({ message: 'يجب أن يكون اسم المجموعة نصاً.' })
  readonly name: string;

  @IsNotEmpty({ message: 'معرف المرحلة الدراسية مطلوب.' })
  @IsString({ message: 'يجب أن يكون معرف المرحلة الدراسية نصاً.' })
  readonly gradeId: string;

  @IsNotEmpty({ message: 'معرف المادة الدراسية مطلوب.' })
  @IsString({ message: 'يجب أن يكون معرف المادة الدراسية نصاً.' })
  readonly subjectId: string;

  @IsNotEmpty({ message: 'معرف المعلم مطلوب.' })
  @IsString({ message: 'يجب أن يكون معرف المعلم نصاً.' })
  readonly teacherId: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'يجب أن تكون السعة الاستيعابية رقماً صحيحاً.' })
  @Min(1, { message: 'يجب ألا تقل السعة الاستيعابية عن 1.' })
  readonly capacity?: number;

  @IsNotEmpty({ message: 'قيمة الاشتراك الشهري مطلوبة.' })
  @Type(() => Number)
  @IsNumber({}, { message: 'يجب أن تكون قيمة الاشتراك الشهري رقماً.' })
  @Min(0, { message: 'يجب ألا تقل قيمة الاشتراك الشهري عن 0.' })
  readonly monthlyFee: number;

  @IsNotEmpty({ message: 'تاريخ بداية المجموعة مطلوب.' })
  @IsDateString({}, { message: 'تاريخ بداية المجموعة غير صالح.' })
  readonly startDate: string;

  @IsNotEmpty({ message: 'عدد أشهر المجموعة مطلوب.' })
  @Type(() => Number)
  @IsInt({ message: 'يجب أن يكون عدد الأشهر رقماً صحيحاً.' })
  @Min(1, { message: 'يجب ألا يقل عدد الأشهر عن 1.' })
  readonly monthsCount: number;

  @IsNotEmpty({ message: 'يجب تحديد مواعيد المجموعة.' })
  @IsArray({ message: 'مواعيد المجموعة يجب أن تكون قائمة.' })
  @ValidateNested({ each: true })
  @Type(() => GroupScheduleDto)
  readonly schedule: GroupScheduleDto[];
}
