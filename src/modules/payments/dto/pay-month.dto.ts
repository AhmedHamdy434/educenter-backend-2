import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsDateString,
  IsNumber,
  Min,
  IsEnum,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '@prisma/client';
import { ToBoolean } from '../../../common/decorators/to-boolean.decorator';

export class PayMonthDto {
  @IsNotEmpty({ message: 'تاريخ الشهر مطلوب.' })
  @IsDateString({}, { message: 'يجب إدخال تاريخ صحيح.' })
  readonly subscriptionDate: string;

  @IsNotEmpty({ message: 'المبلغ المدفوع مطلوب.' })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'المبلغ المدفوع يجب أن يكون رقماً بحد أقصى خانتين عشريتين.' },
  )
  @Min(0.01, { message: 'المبلغ المدفوع يجب أن يكون أكبر من الصفر.' })
  @Type(() => Number)
  readonly amount: number;

  @IsOptional()
  @IsEnum(PaymentMethod, { message: 'طريقة الدفع غير صالحة.' })
  readonly paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsString({ message: 'يجب أن تكون الملاحظات نصاً.' })
  readonly notes?: string;

  @IsOptional()
  @ToBoolean()
  @IsBoolean({ message: 'حقل اعتبار الشهر مسدداً يجب أن يكون قيمة منطقية.' })
  readonly markAsFullPayment?: boolean = false;
}
