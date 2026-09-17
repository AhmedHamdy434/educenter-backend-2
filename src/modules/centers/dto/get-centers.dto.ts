import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { BaseQueryDto } from '../../../common/dto/BaseQueryDto';

export class CenterQueryDto extends BaseQueryDto {
  @ApiPropertyOptional({
    description: 'تصفية المراكز حسب حالة التفعيل (true / false)',
    example: true,
  })
  @IsOptional()
  @Transform(({ obj, key }) => {
    const value = (obj as Record<string, unknown>)[key];
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
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
