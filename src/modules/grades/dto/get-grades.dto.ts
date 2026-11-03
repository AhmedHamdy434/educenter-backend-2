import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { BaseQueryDto } from '../../../common/dto/BaseQueryDto';
import { ToBoolean } from '../../../common/decorators/to-boolean.decorator';

export class GradeQueryDto extends BaseQueryDto {
  @IsOptional()
  @ToBoolean()
  @IsBoolean({ message: 'حالة التفعيل يجب أن تكون قيمة منطقية.' })
  readonly active?: boolean;

  @IsOptional()
  @IsString()
  declare readonly search?: string;

  @IsOptional()
  @IsIn(['name', 'order', 'createdAt', 'subjects', 'groups', 'enrollments'], {
    message:
      'حقل الترتيب يجب أن يكون أحد الحقول التالية: name, order, createdAt, subjects, groups, enrollments.',
  })
  declare readonly sortBy?: string;
}
