import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional } from 'class-validator';
import { ExtraSessionStatus, ExtraSessionType } from '@prisma/client';
import { BaseQueryDto } from '../../../common/dto/BaseQueryDto';

export class GetExtraSessionsDto extends BaseQueryDto {
  @ApiPropertyOptional({
    description: 'فلترة حسب حالة الحصة الإضافية',
    enum: ExtraSessionStatus,
    example: ExtraSessionStatus.SCHEDULED,
  })
  @IsOptional()
  @IsEnum(ExtraSessionStatus, { message: 'حالة الحصة الإضافية غير صالحة.' })
  readonly status?: ExtraSessionStatus;

  @ApiPropertyOptional({
    description: 'فلترة حسب نوع الحصة الإضافية',
    enum: ExtraSessionType,
    example: ExtraSessionType.REVISION,
  })
  @IsOptional()
  @IsEnum(ExtraSessionType, { message: 'نوع الحصة الإضافية غير صالح.' })
  readonly type?: ExtraSessionType;

  @ApiPropertyOptional({
    description: 'حقل الترتيب',
    enum: ['date', 'createdAt', 'fee', 'title'],
    example: 'date',
  })
  @IsOptional()
  @IsIn(['date', 'createdAt', 'fee', 'title'], {
    message: 'حقل الترتيب غير مسموح به.',
  })
  declare readonly sortBy?: string;
}
