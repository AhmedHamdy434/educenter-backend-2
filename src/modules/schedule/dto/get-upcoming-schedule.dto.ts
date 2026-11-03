import { IsOptional, IsString } from 'class-validator';

export class GetUpcomingScheduleDto {
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
