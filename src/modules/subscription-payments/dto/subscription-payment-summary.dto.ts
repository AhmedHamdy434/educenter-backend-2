import { Type } from 'class-transformer';
import { IsDate, IsOptional } from 'class-validator';

export class SubscriptionPaymentSummaryDto {
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'تاريخ البداية غير صالح.' })
  readonly from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'تاريخ النهاية غير صالح.' })
  readonly to?: Date;
}
