import { Type } from 'class-transformer';
import {
  IsDate,
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  MinLength,
} from 'class-validator';

export class CreateCenterDto {
  // ==========================================
  // Center Details
  // ==========================================

  @IsNotEmpty()
  @IsString()
  readonly name!: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message:
      'يجب أن يحتوي الرابط البديل (slug) على أحرف صغيرة وأرقام وشرطات فقط بدون مسافات.',
  })
  readonly slug!: string;

  @IsNotEmpty()
  @IsEmail({}, { message: 'البريد الإلكتروني للمركز غير صالح.' })
  readonly email!: string;

  @IsNotEmpty()
  @IsString()
  readonly phone!: string;

  @IsOptional()
  @IsString()
  readonly description?: string;

  @IsOptional()
  @IsString()
  readonly logo?: string;

  @IsOptional()
  @IsString()
  readonly address?: string;

  // ==========================================
  // Owner Details
  // ==========================================

  @IsNotEmpty()
  @IsString()
  readonly ownerFullName!: string;

  @IsNotEmpty()
  @IsEmail({}, { message: 'البريد الإلكتروني للمالك غير صالح.' })
  readonly ownerEmail!: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(6, { message: 'يجب ألا تقل كلمة مرور المالك عن 6 أحرف.' })
  readonly ownerPassword!: string;

  // ==========================================
  // Subscription Details
  // ==========================================

  @IsNotEmpty()
  @IsString()
  readonly subscriptionPlanId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'السعر المخصص يجب أن يكون رقماً صالحاً.' })
  @Min(0, { message: 'السعر لا يمكن أن يكون سالباً.' })
  readonly customPrice?: number;

  @IsNotEmpty()
  @Type(() => Date)
  @IsDate()
  readonly startDate!: Date;
}
