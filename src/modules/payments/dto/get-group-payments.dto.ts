import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { BaseQueryDto } from '../../../common/dto/BaseQueryDto';

export class GetGroupPaymentsQueryDto extends BaseQueryDto {
  @IsOptional()
  @IsString({ message: 'كلمة البحث يجب أن تكون نصاً.' })
  declare readonly search?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}(-\d{2})?$/, {
    message: 'تاريخ الشهر يجب أن يكون بصيغة YYYY-MM أو YYYY-MM-DD.',
  })
  readonly month?: string;

  @IsOptional()
  @IsIn(['name', 'joinedAt', 'subscriptionStartDate'], {
    message:
      'حقل الترتيب يجب أن يكون أحد الحقول التالية: name, joinedAt, subscriptionStartDate.',
  })
  declare readonly sortBy?: string;
}
