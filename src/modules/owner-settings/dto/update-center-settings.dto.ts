import {
  IsNumber,
  IsOptional,
  IsString,
  Min,
  Max,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateCenterSettingsDto {
  @IsNumber({}, { message: 'نسبة المركز يجب أن تكون رقماً.' })
  @Min(0, { message: 'نسبة المركز لا يمكن أن تقل عن 0%.' })
  @Max(100, { message: 'نسبة المركز لا يمكن أن تزيد عن 100%.' })
  @Type(() => Number)
  readonly centerSharePercentage: number;

  @IsNumber({}, { message: 'نسبة المعلم يجب أن تكون رقماً.' })
  @Min(0, { message: 'نسبة المعلم لا يمكن أن تقل عن 0%.' })
  @Max(100, { message: 'نسبة المعلم لا يمكن أن تزيد عن 100%.' })
  @Type(() => Number)
  readonly teacherSharePercentage: number;

  @IsOptional()
  @IsBoolean({ message: 'تفعيل الرصيد الدائن يجب أن يكون قيمة منطقية.' })
  readonly allowStudentCreditAdvance?: boolean;

  @IsOptional()
  @IsString({ message: 'العملة يجب أن تكون نصاً.' })
  readonly currency?: string;

  @IsOptional()
  @IsString({ message: 'ملاحظات الإيصال يجب أن تكون نصاً.' })
  readonly receiptNotes?: string;
}
