import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { BaseQueryDto } from '../../../common/dto/BaseQueryDto';
import { ToBoolean } from '../../../common/decorators/to-boolean.decorator';

export class SubjectQueryDto extends BaseQueryDto {
  @ApiPropertyOptional({
    description: 'تصفية المواد الدراسية حسب حالة التفعيل (true / false)',
    example: true,
  })
  @IsOptional()
  @ToBoolean()
  @IsBoolean({ message: 'حالة التفعيل يجب أن تكون قيمة منطقية.' })
  readonly active?: boolean;

  @ApiPropertyOptional({
    description: 'تصفية المواد الدراسية حسب المرحلة الدراسية',
    example: 'grade-cuid-123',
  })
  @IsOptional()
  @IsString({ message: 'معرف المرحلة الدراسية يجب أن يكون نصاً.' })
  readonly gradeId?: string;

  @ApiPropertyOptional({
    description:
      'حقل الترتيب: name, createdAt أو عدد المجموعات groups, عدد المعلمين teachers',
    enum: ['name', 'createdAt', 'groups', 'teachers'],
    example: 'name',
  })
  @IsOptional()
  @IsIn(['name', 'createdAt', 'groups', 'teachers'], {
    message:
      'حقل الترتيب يجب أن يكون أحد الحقول التالية: name, createdAt, groups, teachers.',
  })
  declare readonly sortBy?: string;
}
