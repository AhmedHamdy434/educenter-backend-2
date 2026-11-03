import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class GetCalendarScheduleDto {
  @IsNotEmpty({ message: 'الشهر مطلوب بصيغة YYYY-MM.' })
  @IsString({ message: 'قيمة الشهر يجب أن تكون نصاً.' })
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'صيغة الشهر يجب أن تكون YYYY-MM (مثال: 2026-10).',
  })
  readonly month!: string;

  @IsOptional()
  @IsString({ message: 'معرف المعلم يجب أن يكون نصاً.' })
  readonly teacherId?: string;

  @IsOptional()
  @IsString({ message: 'معرف المرحلة الدراسية يجب أن يكون نصاً.' })
  readonly gradeId?: string;

  @IsOptional()
  @IsString({ message: 'معرف المادة الدراسية يجب أن يكون نصاً.' })
  readonly subjectId?: string;

  @IsOptional()
  @IsString({ message: 'معرف المجموعة الدراسية يجب أن يكون نصاً.' })
  readonly groupId?: string;
}
