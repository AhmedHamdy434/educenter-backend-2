import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { BaseQueryDto } from '../../../common/dto/BaseQueryDto';
import { ToBoolean } from '../../../common/decorators/to-boolean.decorator';

export class TeacherQueryDto extends BaseQueryDto {
  @ApiPropertyOptional({
    description: 'تصفية المدرسين حسب حالة التفعيل (true / false)',
    example: true,
  })
  @IsOptional()
  @ToBoolean()
  @IsBoolean({ message: 'حالة التفعيل يجب أن تكون قيمة منطقية.' })
  readonly active?: boolean;

  @ApiPropertyOptional({
    description: 'تصفية المدرسين حسب معرف المادة الدراسية',
    example: 'cm123456789',
  })
  @IsOptional()
  @IsString()
  readonly subjectId?: string;

  @ApiPropertyOptional({
    description: 'تصفية المدرسين حسب معرف المرحلة الدراسية',
    example: 'cm123456789',
  })
  @IsOptional()
  @IsString()
  readonly gradeId?: string;

  @ApiPropertyOptional({
    description: 'البحث باسم المدرس، البريد، رقم الهاتف أو النبذة التعريفية',
    example: 'محمد',
  })
  @IsOptional()
  @IsString()
  declare readonly search?: string;

  @ApiPropertyOptional({
    description:
      'حقل الترتيب: fullName, name, email, phone, createdAt أو عدد المجموعات groups, عدد المواد subjects',
    enum: [
      'fullName',
      'name',
      'email',
      'phone',
      'createdAt',
      'groups',
      'subjects',
    ],
    example: 'createdAt',
  })
  @IsOptional()
  @IsIn(
    ['fullName', 'name', 'email', 'phone', 'createdAt', 'groups', 'subjects'],
    {
      message:
        'حقل الترتيب يجب أن يكون أحد الحقول التالية: fullName, name, email, phone, createdAt, groups, subjects.',
    },
  )
  declare readonly sortBy?: string;
}
