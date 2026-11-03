import { IsEnum, IsIn, IsOptional } from 'class-validator';
import { ExtraSessionStatus, ExtraSessionType } from '@prisma/client';
import { BaseQueryDto } from '../../../common/dto/BaseQueryDto';

export class GetExtraSessionsDto extends BaseQueryDto {
  @IsOptional()
  @IsEnum(ExtraSessionStatus, { message: 'حالة الحصة الإضافية غير صالحة.' })
  readonly status?: ExtraSessionStatus;

  @IsOptional()
  @IsEnum(ExtraSessionType, { message: 'نوع الحصة الإضافية غير صالح.' })
  readonly type?: ExtraSessionType;

  @IsOptional()
  @IsIn(['date', 'createdAt', 'fee', 'title'], {
    message: 'حقل الترتيب غير مسموح به.',
  })
  declare readonly sortBy?: string;
}
