import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { BaseQueryDto } from '../../../common/dto/BaseQueryDto';
import { ToBoolean } from '../../../common/decorators/to-boolean.decorator';

export class TeacherQueryDto extends BaseQueryDto {
  @IsOptional()
  @ToBoolean()
  @IsBoolean({ message: 'حالة التفعيل يجب أن تكون قيمة منطقية.' })
  readonly active?: boolean;

  @IsOptional()
  @IsString()
  readonly subjectId?: string;

  @IsOptional()
  @IsString()
  readonly gradeId?: string;

  @IsOptional()
  @IsString()
  declare readonly search?: string;

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
