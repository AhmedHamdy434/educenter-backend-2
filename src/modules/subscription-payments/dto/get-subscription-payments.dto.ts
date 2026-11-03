import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsString } from 'class-validator';
import { BaseQueryDto } from '../../../common/dto/BaseQueryDto';

export class GetSubscriptionPaymentsDto extends BaseQueryDto {
  @IsOptional()
  @IsString({ message: 'معرف المركز يجب أن يكون نصياً.' })
  readonly centerId?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'تاريخ البداية غير صالح.' })
  readonly from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'تاريخ النهاية غير صالح.' })
  readonly to?: Date;
}
