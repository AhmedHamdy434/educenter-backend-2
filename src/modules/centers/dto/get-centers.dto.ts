import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { BaseQueryDto } from '../../../common/dto/BaseQueryDto';
import { ToBoolean } from '../../../common/decorators/to-boolean.decorator';

export class CenterQueryDto extends BaseQueryDto {
  @ApiPropertyOptional({
    description: 'تصفية المراكز حسب حالة التفعيل (true / false)',
    example: true,
  })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  readonly active?: boolean;

  @ApiPropertyOptional({
    description: 'البحث بالاسم أو البريد الإلكتروني أو الهاتف أو الرابط (slug)',
    example: 'الأوائل',
  })
  @IsOptional()
  @IsString()
  declare readonly search?: string;
}
