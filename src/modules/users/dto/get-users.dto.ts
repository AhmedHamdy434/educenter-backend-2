import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import { UserRole } from '@prisma/client';
import { BaseQueryDto } from '../../../common/dto/BaseQueryDto';

export class UserQueryDto extends BaseQueryDto {
  @IsOptional()
  @IsEnum(UserRole, { message: 'نوع الحساب غير صالح.' })
  readonly role?: UserRole;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean({ message: 'حالة التفعيل يجب أن تكون قيمة منطقية.' })
  readonly isActive?: boolean;
}
