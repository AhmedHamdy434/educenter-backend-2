import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsDateString,
  IsNumber,
  Min,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '@prisma/client';

export class PayMonthDto {
  @IsNotEmpty({ message: 'تاريخ الشهر مطلوب.' })
  @IsDateString({}, { message: 'يجب إدخال تاريخ صحيح.' })
  readonly subscriptionDate: string;

  @IsOptional()
  @IsNumber({}, { message: 'المبلغ المدفوع يجب أن يكون رقماً.' })
  @Min(1, { message: 'المبلغ المدفوع يجب أن يكون 1 ج.م على الأقل.' })
  @Type(() => Number)
  readonly amount?: number;

  @IsOptional()
  @IsEnum(PaymentMethod, { message: 'طريقة الدفع غير صالحة.' })
  readonly paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsString({ message: 'يجب أن تكون الملاحظات نصاً.' })
  readonly notes?: string;
}
