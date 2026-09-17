import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateSubscriptionPaymentDto {
  @ApiProperty({
    description: 'معرف اشتراك المركز المرتبط بالدفعة',
    example: 'cm7a1b2c3d4e5f6g7h8i9j0k',
  })
  @IsNotEmpty({ message: 'معرف اشتراك المركز مطلوب.' })
  @IsString({ message: 'معرف اشتراك المركز يجب أن يكون نصياً.' })
  readonly centerSubscriptionId!: string;

  @ApiProperty({
    description: 'مبلغ الدفعة المسدد للاشتراك',
    example: 1500,
  })
  @IsNotEmpty({ message: 'مبلغ الدفعة مطلوب.' })
  @Type(() => Number)
  @IsNumber({}, { message: 'مبلغ الدفعة يجب أن يكون رقماً صالحاً.' })
  @Min(0, { message: 'مبلغ الدفعة لا يمكن أن يكون سالباً.' })
  readonly paid!: number;

  @ApiProperty({
    description: 'تاريخ بداية فترة الاشتراك المغطاة بالدفعة',
    example: '2026-09-01T00:00:00.000Z',
  })
  @IsNotEmpty({ message: 'تاريخ بداية الفترة مطلوب.' })
  @Type(() => Date)
  @IsDate({ message: 'تاريخ بداية الفترة غير صالح.' })
  readonly periodStart!: Date;

  @ApiProperty({
    description: 'تاريخ نهاية فترة الاشتراك المغطاة بالدفعة',
    example: '2026-10-01T00:00:00.000Z',
  })
  @IsNotEmpty({ message: 'تاريخ نهاية الفترة مطلوب.' })
  @Type(() => Date)
  @IsDate({ message: 'تاريخ نهاية الفترة غير صالح.' })
  readonly periodEnd!: Date;

  @ApiPropertyOptional({
    description: 'طريقة الدفع (كاش، فودافون كاش، تحويل بنكي)',
    example: 'Vodafone Cash',
  })
  @IsOptional()
  @IsString({ message: 'طريقة الدفع يجب أن تكون نصية.' })
  readonly paymentMethod?: string;

  @ApiPropertyOptional({
    description: 'ملاحظات إضافية حول الدفعة',
    example: 'تم التحويل واستلام الإيصال برقم عملية 987654',
  })
  @IsOptional()
  @IsString({ message: 'الملاحظات يجب أن تكون نصية.' })
  readonly notes?: string;
}
