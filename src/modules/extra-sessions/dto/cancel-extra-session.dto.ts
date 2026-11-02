import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CancelExtraSessionDto {
  @ApiPropertyOptional({
    description:
      'ملاحظات معالجة المبالغ المستردة للطلاب (إلزامية في حال وجود مدفوعات مسجلة للحصة)',
    example: 'تم رد المبلغ نقداً لولي الأمر في مكتب السكرتارية.',
  })
  @IsOptional()
  @IsString({ message: 'ملاحظات الاسترداد يجب أن تكون نصاً صالحاً.' })
  readonly confirmRefundNotes?: string;
}
