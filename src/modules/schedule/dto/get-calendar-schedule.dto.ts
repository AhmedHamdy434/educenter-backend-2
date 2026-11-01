import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class GetCalendarScheduleDto {
  @ApiProperty({
    description: 'الشهر المطلوب جلبه بصيغة YYYY-MM (مثال: 2026-10)',
    example: '2026-10',
  })
  @IsNotEmpty({ message: 'الشهر مطلوب بصيغة YYYY-MM.' })
  @IsString({ message: 'قيمة الشهر يجب أن تكون نصاً.' })
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'صيغة الشهر يجب أن تكون YYYY-MM (مثال: 2026-10).',
  })
  readonly month!: string;

  @ApiPropertyOptional({
    description: 'تصفية الحصص حسب المعلم',
    example: 'clyteacher001',
  })
  @IsOptional()
  @IsString({ message: 'معرف المعلم يجب أن يكون نصاً.' })
  readonly teacherId?: string;

  @ApiPropertyOptional({
    description: 'تصفية الحصص حسب المرحلة الدراسية',
    example: 'clygrade001',
  })
  @IsOptional()
  @IsString({ message: 'معرف المرحلة الدراسية يجب أن يكون نصاً.' })
  readonly gradeId?: string;

  @ApiPropertyOptional({
    description: 'تصفية الحصص حسب المادة الدراسية',
    example: 'clysubject001',
  })
  @IsOptional()
  @IsString({ message: 'معرف المادة الدراسية يجب أن يكون نصاً.' })
  readonly subjectId?: string;

  @ApiPropertyOptional({
    description: 'تصفية الحصص حسب المجموعة الدراسية',
    example: 'clygroup001',
  })
  @IsOptional()
  @IsString({ message: 'معرف المجموعة الدراسية يجب أن يكون نصاً.' })
  readonly groupId?: string;
}
