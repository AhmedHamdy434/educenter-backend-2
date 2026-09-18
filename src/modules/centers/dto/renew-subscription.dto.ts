import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class RenewSubscriptionDto {
  @ApiPropertyOptional({
    description:
      'معرف باقة جديدة إذا رغب المركز في الترقية/التبديل عند التجديد',
    example: 'cuid-plan-premium',
  })
  @IsOptional()
  @IsString()
  readonly subscriptionPlanId?: string;

  @ApiPropertyOptional({
    description: 'عدد الأشهر المراد تجديدها',
    default: 1,
    minimum: 1,
    example: 3,
  })
  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsInt()
  @Min(1)
  readonly monthsCount?: number = 1;

  @ApiPropertyOptional({
    description: 'تفعيل التجديد التلقائي للاشتراك',
    default: false,
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  readonly autoRenew?: boolean;

  @ApiPropertyOptional({
    description: 'سعر مخصص لكل شهر عند التجديد',
    example: 1000,
  })
  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsNumber({}, { message: 'السعر المخصص يجب أن يكون رقماً صالحاً.' })
  @Min(0, { message: 'السعر لا يمكن أن يكون سالباً.' })
  readonly customPrice?: number;

  @ApiPropertyOptional({
    description: 'سعر مخصص بديل',
    example: 1000,
  })
  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsNumber({}, { message: 'السعر المخصص يجب أن يكون رقماً صالحاً.' })
  @Min(0, { message: 'السعر لا يمكن أن يكون سالباً.' })
  readonly price?: number;

  @ApiPropertyOptional({
    description:
      'تاريخ بداية التجديد (اختياري، الافتراضي: الشهر التالي للاشتراك الساري أو الشهر الحالي للمنتهي)',
    example: '2026-10-01T00:00:00.000Z',
  })
  @IsOptional()
  // @IsDateString({}, { message: 'تاريخ بداية الاشتراك غير صالح.' })
  readonly startDate?: Date;
}
