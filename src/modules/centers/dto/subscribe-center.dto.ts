import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class SubscribeCenterDto {
  @ApiProperty({
    description: 'معرف باقة الاشتراك المراد الاشتراك بها',
    example: 'cuid-plan-premium',
  })
  @IsNotEmpty()
  @IsString()
  readonly subscriptionPlanId!: string;

  @ApiPropertyOptional({
    description: 'سعر الاشتراك المخصص (اختياري، يتجاوز سعر الباقة الافتراضي)',
    example: 1500,
  })
  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsNumber({}, { message: 'السعر المخصص يجب أن يكون رقماً صالحاً.' })
  @Min(0, { message: 'السعر لا يمكن أن يكون سالباً.' })
  readonly price?: number;
}
