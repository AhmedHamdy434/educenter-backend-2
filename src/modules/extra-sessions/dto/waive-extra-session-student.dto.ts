import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class WaiveExtraSessionStudentDto {
  @ApiPropertyOptional({
    description: 'سبب أو ملاحظات الإعفاء من رسوم الحصة',
    example: 'إعفاء بقرار من مدرس المادة للتفوق',
  })
  @IsOptional()
  @IsString({ message: 'ملاحظات الإعفاء يجب أن تكون نصاً صالحاً.' })
  readonly notes?: string;
}
