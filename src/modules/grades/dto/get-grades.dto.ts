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
      'حقل الترتيب (الاسم name أو الترتيب order أو تاريخ الإنشاء createdAt)',
    enum: ['name', 'order', 'createdAt'],
    example: 'name',
  })
  @IsOptional()
  @IsIn(['name', 'order', 'createdAt'], {
    message:
      'حقل الترتيب يجب أن يكون أحد الحقول التالية: name, order, createdAt.',
  })
  declare readonly sortBy?: string;
}
