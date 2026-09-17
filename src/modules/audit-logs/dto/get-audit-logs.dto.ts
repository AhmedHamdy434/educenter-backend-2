import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AuditAction } from '@prisma/client';
import { BaseQueryDto } from '../../../common/dto/BaseQueryDto';

export class AuditLogQueryDto extends BaseQueryDto {
  @IsOptional()
  @IsEnum(AuditAction, { message: 'نوع الإجراء غير صالح.' })
  readonly action?: AuditAction;

  @IsOptional()
  @IsString({ message: 'اسم الكيان يجب أن يكون نصاً.' })
  readonly entity?: string;
}
