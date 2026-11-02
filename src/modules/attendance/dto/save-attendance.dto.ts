import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { AttendanceStatus } from '@prisma/client';

export class AttendanceRecordDto {
  @IsOptional()
  @IsString({ message: 'معرف الطالب يجب أن يكون نصياً.' })
  studentId?: string;

  @IsOptional()
  @IsString({ message: 'كود الطالب يجب أن يكون نصياً.' })
  readonly studentCode?: string;

  @IsNotEmpty({ message: 'حالة الحضور مطلوبة.' })
  @IsEnum(AttendanceStatus, { message: 'حالة حضور غير صالحة.' })
  readonly status: AttendanceStatus;

  @IsOptional()
  @IsString({ message: 'سبب الغياب أو الملاحظة يجب أن يكون نصياً.' })
  readonly absenceReason?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'المبلغ المدفوع يجب أن يكون رقماً صالحاً.' })
  @Min(0, { message: 'المبلغ المدفوع لا يمكن أن يكون سالباً.' })
  readonly paid?: number;

  @IsOptional()
  @IsBoolean({ message: 'حالة الإعفاء يجب أن تكون قيمة منطقية.' })
  readonly isWaived?: boolean;

  @IsOptional()
  @IsString({ message: 'ملاحظات الدفع يجب أن تكون نصية.' })
  readonly paymentNotes?: string;
}

export class SaveAttendanceDto {
  @IsNotEmpty()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttendanceRecordDto)
  readonly records: AttendanceRecordDto[];
}
