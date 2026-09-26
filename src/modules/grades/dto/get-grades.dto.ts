import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { BaseQueryDto } from '../../../common/dto/BaseQueryDto';
import { ToBoolean } from '../../../common/decorators/to-boolean.decorator';

export class GradeQueryDto extends BaseQueryDto {
  @ApiPropertyOptional({
    description: 'تصفية المراحل الدراسية حسب حالة التفعيل (true / false)',
    example: true,
  })
  @IsOptional()
  @ToBoolean()
  @IsBoolean({ message: 'حالة التفعيل يجب أن تكون قيمة منطقية.' })
  readonly active?: boolean;

  @ApiPropertyOptional({
    description: 'البحث باسم المرحلة الدراسية أو الوصف',
    example: 'الصف الأول الثانوي',
  })
  @IsOptional()
  @IsString()
  declare readonly search?: string;

  @ApiPropertyOptional({
    description:
      'حقل الترتيب: name, order, createdAt أو عدد المواد subjects, عدد المجموعات groups, عدد الطلاب enrollments',
    enum: ['name', 'order', 'createdAt', 'subjects', 'groups', 'enrollments'],
    example: 'subjects',
  })
  @IsOptional()
  @IsIn(['name', 'order', 'createdAt', 'subjects', 'groups', 'enrollments'], {
    message:
      'حقل الترتيب يجب أن يكون أحد الحقول التالية: name, order, createdAt, subjects, groups, enrollments.',
  })
  declare readonly sortBy?: string;
}
