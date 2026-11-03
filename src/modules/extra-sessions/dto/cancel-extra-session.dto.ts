import { IsOptional, IsString } from 'class-validator';

export class CancelExtraSessionDto {
  @IsOptional()
  @IsString({ message: 'ملاحظات الاسترداد يجب أن تكون نصاً صالحاً.' })
  readonly confirmRefundNotes?: string;
}
