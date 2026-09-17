import { IsEnum, IsOptional } from 'class-validator';
import { NotificationType } from '@prisma/client';
import { BaseQueryDto } from '../../../common/dto/BaseQueryDto';

export class NotificationQueryDto extends BaseQueryDto {
  @IsOptional()
  @IsEnum(NotificationType, { message: 'نوع الإشعار غير صالح.' })
  readonly type?: NotificationType;
}
