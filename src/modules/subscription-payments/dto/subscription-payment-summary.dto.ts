import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsOptional } from 'class-validator';

export class SubscriptionPaymentSummaryDto {
  @ApiPropertyOptional({
    description: 'تاريخ بداية النطاق الزمني لحساب ملخص الإيرادات',
    example: '2026-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'تاريخ البداية غير صالح.' })
  readonly from?: Date;

  @ApiPropertyOptional({
    description: 'تاريخ نهاية النطاق الزمني لحساب ملخص الإيرادات',
    example: '2026-12-31T23:59:59.999Z',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'تاريخ النهاية غير صالح.' })
  readonly to?: Date;
}
