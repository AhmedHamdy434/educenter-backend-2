import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { BaseQueryDto } from '../../../common/dto/BaseQueryDto';

export class GetGroupPaymentsQueryDto extends BaseQueryDto {
  @ApiPropertyOptional({
    description:
      'البحث باسم الطالب أو رقم الهاتف أو البريد الإلكتروني أو كود الطالب',
    example: 'أحمد',
  })
  @IsOptional()
  @IsString({ message: 'كلمة البحث يجب أن تكون نصاً.' })
  declare readonly search?: string;

  @ApiPropertyOptional({
    description: 'تصفية أو البحث عن شهر محدد بصيغة YYYY-MM أو YYYY-MM-DD',
    example: '2026-10',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}(-\d{2})?$/, {
    message: 'تاريخ الشهر يجب أن يكون بصيغة YYYY-MM أو YYYY-MM-DD.',
  })
  readonly month?: string;

  @ApiPropertyOptional({
    description: 'حقل الترتيب: name, joinedAt, subscriptionStartDate',
    enum: ['name', 'joinedAt', 'subscriptionStartDate'],
    example: 'name',
  })
  @IsOptional()
  @IsIn(['name', 'joinedAt', 'subscriptionStartDate'], {
    message:
      'حقل الترتيب يجب أن يكون أحد الحقول التالية: name, joinedAt, subscriptionStartDate.',
  })
  declare readonly sortBy?: string;
}
