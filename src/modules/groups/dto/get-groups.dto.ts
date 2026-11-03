import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { BaseQueryDto } from '../../../common/dto/BaseQueryDto';
import { ToBoolean } from '../../../common/decorators/to-boolean.decorator';

export class GroupQueryDto extends BaseQueryDto {
  @IsOptional()
  @ToBoolean()
  @IsBoolean({ message: 'حالة التفعيل يجب أن تكون قيمة منطقية.' })
  readonly active?: boolean;

  @IsOptional()
  @IsString({ message: 'معرف المرحلة الدراسية يجب أن يكون نصاً.' })
  readonly gradeId?: string;

  @IsOptional()
  @IsString({ message: 'معرف المادة الدراسية يجب أن يكون نصاً.' })
  readonly subjectId?: string;

  @IsOptional()
  @IsString({ message: 'معرف المعلم يجب أن يكون نصاً.' })
  readonly teacherId?: string;

  @IsOptional()
  @IsString()
  declare readonly search?: string;

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
