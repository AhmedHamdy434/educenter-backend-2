import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { BaseQueryDto } from '../../../common/dto/BaseQueryDto';
import { ToBoolean } from '../../../common/decorators/to-boolean.decorator';

export class StudentQueryDto extends BaseQueryDto {
  @ApiPropertyOptional({
    description: 'تصفية الطلاب حسب حالة التفعيل (true / false)',
    example: true,
  })
  @IsOptional()
  @ToBoolean()
  @IsBoolean({ message: 'حالة التفعيل يجب أن تكون قيمة منطقية.' })
  readonly active?: boolean;

  @ApiPropertyOptional({
    description: 'تصفية الطلاب حسب معرف المرحلة الدراسية',
    example: 'cm123456789',
  })
  @IsOptional()
  @IsString()
  readonly gradeId?: string;

  @ApiPropertyOptional({
    description: 'البحث باسم الطالب، البريد، رقم الهاتف أو رقم ولي الأمر',
    example: 'أحمد',
  })
  @IsOptional()
  @IsString()
  declare readonly search?: string;

  @ApiPropertyOptional({
    description:
      'حقل الترتيب: fullName, name, email, phone, parentPhone, createdAt أو عدد المجموعات groups, الحضور attendance',
    enum: [
      'fullName',
      'name',
      'email',
      'phone',
      'parentPhone',
      'createdAt',
      'groups',
      'attendance',
    ],
    example: 'createdAt',
  })
  @IsOptional()
  @IsIn(
    [
      'fullName',
      'name',
      'email',
      'phone',
      'parentPhone',
      'createdAt',
      'groups',
      'attendance',
    ],
    {
      message:
        'حقل الترتيب يجب أن يكون أحد الحقول التالية: fullName, name, email, phone, parentPhone, createdAt, groups, attendance.',
    },
  )
  declare readonly sortBy?: string;
}
