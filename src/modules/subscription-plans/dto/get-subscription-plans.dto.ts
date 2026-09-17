import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { BaseQueryDto } from '../../../common/dto/BaseQueryDto';

export class SubscriptionPlanQueryDto extends BaseQueryDto {
  @ApiPropertyOptional({
    description: 'تصفية حسب حالة تفعيل الباقة (true / false)',
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
    description: 'تصفية حسب الباقات الشائعة فقط (true / false)',
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
  readonly popular?: boolean;

  @ApiPropertyOptional({
    description: 'البحث باسم الباقة أو الوصف',
    example: 'متقدمة',
  })
  @IsOptional()
  @IsString()
  declare readonly search?: string;
}
