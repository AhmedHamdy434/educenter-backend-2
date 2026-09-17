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
  @IsNotEmpty({ message: 'معرف اشتراك المركز مطلوب.' })
  @IsString({ message: 'معرف اشتراك المركز يجب أن يكون نصياً.' })
  readonly centerSubscriptionId!: string;

  @IsNotEmpty({ message: 'مبلغ الدفعة مطلوب.' })
  @Type(() => Number)
  @IsNumber({}, { message: 'مبلغ الدفعة يجب أن يكون رقماً صالحاً.' })
  @Min(0, { message: 'مبلغ الدفعة لا يمكن أن يكون سالباً.' })
  readonly amount!: number;

  @IsNotEmpty({ message: 'تاريخ بداية الفترة مطلوب.' })
  @Type(() => Date)
  @IsDate({ message: 'تاريخ بداية الفترة غير صالح.' })
  readonly periodStart!: Date;

  @IsNotEmpty({ message: 'تاريخ نهاية الفترة مطلوب.' })
  @Type(() => Date)
  @IsDate({ message: 'تاريخ نهاية الفترة غير صالح.' })
  readonly periodEnd!: Date;

  @IsOptional()
  @IsString({ message: 'طريقة الدفع يجب أن تكون نصية.' })
  readonly paymentMethod?: string;

  @IsOptional()
  @IsString({ message: 'الملاحظات يجب أن تكون نصية.' })
  readonly notes?: string;
}
