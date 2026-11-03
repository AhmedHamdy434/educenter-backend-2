import { IsOptional, IsString } from 'class-validator';

export class WaiveExtraSessionStudentDto {
  @IsOptional()
  @IsString({ message: 'ملاحظات الإعفاء يجب أن تكون نصاً صالحاً.' })
  readonly notes?: string;
}
