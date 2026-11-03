import { IsIn, IsOptional, IsString } from 'class-validator';
import { BaseQueryDto } from '../../../common/dto/BaseQueryDto';

export class GroupStudentsQueryDto extends BaseQueryDto {
  @IsOptional()
  @IsString()
  declare readonly search?: string;

  @IsOptional()
  @IsIn(['joinedAt', 'subscriptionStartDate', 'name'], {
    message:
      'حقل الترتيب يجب أن يكون أحد الحقول التالية: joinedAt, subscriptionStartDate, name.',
  })
  declare readonly sortBy?: string;
}
