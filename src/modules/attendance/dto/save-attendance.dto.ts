import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
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
  @IsString()
  readonly absenceReason?: string;
}

export class SaveAttendanceDto {
  @IsNotEmpty()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttendanceRecordDto)
  readonly records: AttendanceRecordDto[];
}
