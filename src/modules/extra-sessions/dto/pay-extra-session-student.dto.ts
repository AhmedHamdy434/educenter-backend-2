import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class PayExtraSessionStudentDto {
  @ApiPropertyOptional({
    description:
      'المبلغ المدفوع كاش (افتراضياً يساوي المبلغ المستحق على الطالب)',
    example: 50.0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'المبلغ المدفوع يجب أن يكون رقماً صالحاً.' })
  @Min(0.01, { message: 'المبلغ المدفوع يجب أن يكون أكبر من صفر.' })
  readonly amount?: number;

  @ApiPropertyOptional({
    description: 'ملاحظات استلام الدفعة',
    example: 'تم التحصيل كاش بواسطة السكرتارية',
  })
  @IsOptional()
  @IsString({ message: 'الملاحظات يجب أن تكون نصاً صالحاً.' })
  readonly notes?: string;
}
