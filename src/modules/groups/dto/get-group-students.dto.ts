import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { BaseQueryDto } from '../../../common/dto/BaseQueryDto';

export class GroupStudentsQueryDto extends BaseQueryDto {
  @ApiPropertyOptional({
    description:
      'البحث باسم الطالب، البريد الإلكتروني، رقم الهاتف، رقم ولي الأمر أو كود الطالب',
    example: 'أحمد',
  })
  @IsOptional()
  @IsString()
  declare readonly search?: string;

  @ApiPropertyOptional({
    description: 'حقل الترتيب: joinedAt, subscriptionStartDate',
    enum: ['joinedAt', 'subscriptionStartDate', 'name'],
    example: 'joinedAt',
  })
  @IsOptional()
  @IsIn(['joinedAt', 'subscriptionStartDate', 'name'], {
    message:
      'حقل الترتيب يجب أن يكون أحد الحقول التالية: joinedAt, subscriptionStartDate.',
  })
  declare readonly sortBy?: string;
}
