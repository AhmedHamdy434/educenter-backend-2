import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsDateString,
} from 'class-validator';

export class PayMonthDto {
  @IsNotEmpty({ message: 'تاريخ الشهر مطلوب.' })
  @IsDateString({}, { message: 'يجب إدخال تاريخ صحيح.' })
  readonly subscriptionDate: string;

  @IsOptional()
  @IsString({ message: 'يجب أن تكون الملاحظات نصاً.' })
  readonly notes?: string;
}
