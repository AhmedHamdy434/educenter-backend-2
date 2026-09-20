import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { BaseQueryDto } from '../../../common/dto/BaseQueryDto';
import { ToBoolean } from '../../../common/decorators/to-boolean.decorator';

export class SubscriptionPlanQueryDto extends BaseQueryDto {
  @ApiPropertyOptional({
    description: 'تصفية حسب حالة تفعيل الباقة (true / false)',
    example: true,
  })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  readonly active?: boolean;

  @ApiPropertyOptional({
    description: 'تصفية حسب الباقات الشائعة فقط (true / false)',
    example: true,
  })
  @IsOptional()
  @ToBoolean()
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
