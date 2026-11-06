import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CancelSettlementDto {
  @IsNotEmpty({ message: 'سبب إلغاء التسوية مطلوب.' })
  @IsString({ message: 'سبب الإلغاء يجب أن يكون نصاً.' })
  @MaxLength(500, { message: 'سبب الإلغاء لا يمكن أن يتجاوز 500 حرف.' })
  readonly cancellationReason: string;
}
