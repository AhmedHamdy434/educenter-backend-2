import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsString } from 'class-validator';
import { BaseQueryDto } from '../../../common/dto/BaseQueryDto';

export class GetSubscriptionPaymentsDto extends BaseQueryDto {
  @ApiPropertyOptional({
    description: 'تصفية دفعات الاشتراك لمركز محدد بواسطة معرف المركز ID',
    example: 'cuid-center-12345',
  })
  @IsOptional()
  @IsString({ message: 'معرف المركز يجب أن يكون نصياً.' })
  readonly centerId?: string;

  @ApiPropertyOptional({
    description: 'تاريخ بداية النطاق الزمني للبحث',
    example: '2026-09-01T00:00:00.000Z',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'تاريخ البداية غير صالح.' })
  readonly from?: Date;

  @ApiPropertyOptional({
    description: 'تاريخ نهاية النطاق الزمني للبحث',
    example: '2026-09-30T23:59:59.999Z',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'تاريخ النهاية غير صالح.' })
  readonly to?: Date;
}
