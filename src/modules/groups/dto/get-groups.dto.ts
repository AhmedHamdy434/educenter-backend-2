import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { BaseQueryDto } from '../../../common/dto/BaseQueryDto';
import { ToBoolean } from '../../../common/decorators/to-boolean.decorator';

export class GroupQueryDto extends BaseQueryDto {
  @ApiPropertyOptional({
    description: 'تصفية المجموعات الدراسية حسب حالة التفعيل (true / false)',
    example: true,
  })
  @IsOptional()
  @ToBoolean()
  @IsBoolean({ message: 'حالة التفعيل يجب أن تكون قيمة منطقية.' })
  readonly active?: boolean;

  @ApiPropertyOptional({
    description: 'تصفية المجموعات الدراسية حسب المرحلة الدراسية',
    example: 'grade-cuid-123',
  })
  @IsOptional()
  @IsString({ message: 'معرف المرحلة الدراسية يجب أن يكون نصاً.' })
  readonly gradeId?: string;

  @ApiPropertyOptional({
    description: 'تصفية المجموعات الدراسية حسب المادة الدراسية',
    example: 'subject-cuid-123',
  })
  @IsOptional()
  @IsString({ message: 'معرف المادة الدراسية يجب أن يكون نصاً.' })
  readonly subjectId?: string;

  @ApiPropertyOptional({
    description: 'تصفية المجموعات الدراسية حسب المعلم',
    example: 'teacher-cuid-123',
  })
  @IsOptional()
  @IsString({ message: 'معرف المعلم يجب أن يكون نصاً.' })
  readonly teacherId?: string;

  @ApiPropertyOptional({
    description: 'البحث باسم المجموعة الدراسية',
    example: 'مجموعة الفيزياء 1',
  })
  @IsOptional()
  @IsString()
  declare readonly search?: string;

  @ApiPropertyOptional({
    description:
      'حقل الترتيب: name, capacity, monthlyFee, startDate, createdAt أو عدد الطلاب students',
    enum: [
      'name',
      'capacity',
      'monthlyFee',
      'startDate',
      'createdAt',
      'students',
    ],
    example: 'createdAt',
  })
  @IsOptional()
  @IsIn(
    ['name', 'capacity', 'monthlyFee', 'startDate', 'createdAt', 'students'],
    {
      message:
        'حقل الترتيب يجب أن يكون أحد الحقول التالية: name, capacity, monthlyFee, startDate, createdAt, students.',
    },
  )
  declare readonly sortBy?: string;
}
