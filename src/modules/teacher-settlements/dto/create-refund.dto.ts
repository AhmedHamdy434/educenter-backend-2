import {
  IsNotEmpty,
  IsString,
  IsNumber,
  Min,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateRefundDto {
  @IsNotEmpty({ message: 'معرف المعاملة المالية مطلوب.' })
  @IsString({ message: 'معرف المعاملة المالية يجب أن يكون نصاً.' })
  readonly paymentTransactionId: string;

  @IsOptional()
  @IsString({ message: 'معرف التخصيص يجب أن يكون نصاً.' })
  readonly paymentAllocationId?: string;

  @IsNumber({}, { message: 'مبلغ الاسترداد يجب أن يكون رقماً.' })
  @Min(0.01, { message: 'مبلغ الاسترداد يجب أن يكون أكبر من الصفر.' })
  @Type(() => Number)
  readonly amount: number;

  @IsNotEmpty({ message: 'سبب الاسترداد مطلوب.' })
  @IsString({ message: 'سبب الاسترداد يجب أن يكون نصاً.' })
  readonly reason: string;
}
