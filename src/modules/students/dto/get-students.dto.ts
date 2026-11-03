import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { BaseQueryDto } from '../../../common/dto/BaseQueryDto';
import { ToBoolean } from '../../../common/decorators/to-boolean.decorator';

export class StudentQueryDto extends BaseQueryDto {
  @IsOptional()
  @ToBoolean()
  @IsBoolean({ message: 'حالة التفعيل يجب أن تكون قيمة منطقية.' })
  readonly active?: boolean;

  @IsOptional()
  @IsString()
  readonly gradeId?: string;

  @IsOptional()
  @IsString()
  declare readonly search?: string;

  @IsOptional()
  @IsIn(['fullName', 'name', 'email', 'createdAt', 'groups', 'attendance'], {
    message:
      'حقل الترتيب يجب أن يكون أحد الحقول التالية: fullName, name, email, createdAt, groups, attendance.',
  })
  declare readonly sortBy?: string;
}
