import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { BaseQueryDto } from '../../../common/dto/BaseQueryDto';
import { ToBoolean } from '../../../common/decorators/to-boolean.decorator';

export class SubjectQueryDto extends BaseQueryDto {
  @IsOptional()
  @ToBoolean()
  @IsBoolean({ message: 'حالة التفعيل يجب أن تكون قيمة منطقية.' })
  readonly active?: boolean;

  @IsOptional()
  @IsString({ message: 'معرف المرحلة الدراسية يجب أن يكون نصاً.' })
  readonly gradeId?: string;

  @IsOptional()
  @IsIn(['name', 'createdAt', 'groups', 'teachers'], {
    message:
      'حقل الترتيب يجب أن يكون أحد الحقول التالية: name, createdAt, groups, teachers.',
  })
  declare readonly sortBy?: string;
}
