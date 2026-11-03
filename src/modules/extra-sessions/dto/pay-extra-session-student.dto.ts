import { IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class PayExtraSessionStudentDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'المبلغ المدفوع يجب أن يكون رقماً صالحاً.' })
  @Min(0, { message: 'المبلغ المدفوع لا يمكن أن يكون سالباً.' })
  readonly amount?: number;

  @IsOptional()
  @IsString({ message: 'الملاحظات يجب أن تكون نصاً صالحاً.' })
  readonly notes?: string;
}
