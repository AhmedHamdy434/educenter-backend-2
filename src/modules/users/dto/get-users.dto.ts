import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { UserRole } from '@prisma/client';
import { BaseQueryDto } from '../../../common/dto/BaseQueryDto';
import { ToBoolean } from '../../../common/decorators/to-boolean.decorator';

export class UserQueryDto extends BaseQueryDto {
  @IsOptional()
  @IsEnum(UserRole, { message: 'نوع الحساب غير صالح.' })
  readonly role?: UserRole;

  @IsOptional()
  @ToBoolean()
  @IsBoolean({ message: 'حالة التفعيل يجب أن تكون قيمة منطقية.' })
  readonly isActive?: boolean;
}
