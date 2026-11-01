import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class GetUpcomingScheduleDto {
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
