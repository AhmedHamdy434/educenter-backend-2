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
  @IsOptional()
  @IsString()
  readonly subscriptionPlanId?: string;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsInt()
  @Min(1)
  readonly monthsCount?: number = 1;

  @IsOptional()
  @IsBoolean()
  readonly autoRenew?: boolean;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsNumber({}, { message: 'السعر المخصص يجب أن يكون رقماً صالحاً.' })
  @Min(0, { message: 'السعر لا يمكن أن يكون سالباً.' })
  readonly customPrice?: number;
}
