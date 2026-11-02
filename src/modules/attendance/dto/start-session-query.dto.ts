import { IsDateString, IsOptional } from 'class-validator';

export class StartSessionQueryDto {
  @IsOptional()
  @IsDateString(
    {},
    { message: 'تاريخ بدء جلسة الحضور يجب أن يكون بصيغة YYYY-MM-DD.' },
  )
  readonly date?: string;
}
