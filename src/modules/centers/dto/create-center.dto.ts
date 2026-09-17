import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

  @ApiProperty({
    description: 'اسم المركز التعليمي',
    example: 'سنتر الأوائل التعليمي',
  })
  @IsNotEmpty()
  @IsString()
  readonly name!: string;

  @ApiProperty({
    description:
      'الرابط المخصص للمركز (slug) بأحرف إنجليزية صغيرة وأرقام وشرطات',
    example: 'el-awael-center',
  })
  @IsNotEmpty()
  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message:
      'يجب أن يحتوي الرابط البديل (slug) على أحرف صغيرة وأرقام وشرطات فقط بدون مسافات.',
  })
  readonly slug!: string;

  @ApiProperty({
    description: 'البريد الإلكتروني الرسمي للمركز',
    example: 'info@elawael.com',
  })
  @IsNotEmpty()
  @IsEmail({}, { message: 'البريد الإلكتروني للمركز غير صالح.' })
  readonly email!: string;

  @ApiProperty({
    description: 'رقم هاتف المركز',
    example: '01012345678',
  })
  @IsNotEmpty()
  @IsString()
  readonly phone!: string;

  @ApiPropertyOptional({
    description: 'وصف تعريفي بالمركز',
    example: 'مركز متخصص لتدريس المرحلة الثانوية والجامعية',
  })
  @IsOptional()
  @IsString()
  readonly description?: string;

  @ApiPropertyOptional({
    description: 'رابط الشعار أو سيتم رفعه كملف logo',
    example: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
  })
  @IsOptional()
  @IsString()
  readonly logo?: string;

  @ApiPropertyOptional({
    description: 'العنوان الجغرافي للمركز',
    example: 'القاهرة - مدينة نصر - شارع عباس العقاد',
  })
  @IsOptional()
  @IsString()
  readonly address?: string;

  // ==========================================
  // Owner Details
  // ==========================================

  @ApiProperty({
    description: 'الاسم الكامل لمالك المركز',
    example: 'أحمد محمود',
  })
  @IsNotEmpty()
  @IsString()
  readonly ownerFullName!: string;

  @ApiProperty({
    description: 'البريد الإلكتروني لمالك المركز (يستخدم لتسجيل الدخول كـ OWNER)',
    example: 'owner@elawael.com',
  })
  @IsNotEmpty()
  @IsEmail({}, { message: 'البريد الإلكتروني للمالك غير صالح.' })
  readonly ownerEmail!: string;

  @ApiProperty({
    description: 'كلمة مرور حساب مالك المركز (6 أحرف على الأقل)',
    example: 'OwnerP@ssword123',
    minLength: 6,
  })
  @IsNotEmpty()
  @IsString()
  @MinLength(6, { message: 'يجب ألا تقل كلمة مرور المالك عن 6 أحرف.' })
  readonly ownerPassword!: string;

  // ==========================================
  // Subscription Details
  // ==========================================

  @ApiProperty({
    description: 'معرف باقة الاشتراك التي سيبدأ بها المركز',
    example: 'cuid-plan-premium',
  })
  @IsNotEmpty()
  @IsString()
  readonly subscriptionPlanId!: string;

  @ApiPropertyOptional({
    description: 'سعر اشتراك مخصص (في حال الاتفاق على تخفيض أو سعر خاص)',
    example: 1200,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'السعر المخصص يجب أن يكون رقماً صالحاً.' })
  @Min(0, { message: 'السعر لا يمكن أن يكون سالباً.' })
  readonly customPrice?: number;

  @ApiProperty({
    description: 'تاريخ بدء الاشتراك للمركز',
    example: '2026-09-01T00:00:00.000Z',
  })
  @IsNotEmpty()
  @Type(() => Date)
  @IsDate()
  readonly startDate!: Date;
}
