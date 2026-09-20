import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { UserRole } from '@prisma/client';
import { BaseQueryDto } from '../../../common/dto/BaseQueryDto';
import { ToBoolean } from '../../../common/decorators/to-boolean.decorator';

export class UserQueryDto extends BaseQueryDto {
  @ApiPropertyOptional({
    description: 'تصفية المستخدمين حسب الدور (OWNER, TEACHER, STUDENT)',
    enum: UserRole,
    example: UserRole.TEACHER,
  })
  @IsOptional()
  @IsEnum(UserRole, { message: 'نوع الحساب غير صالح.' })
  readonly role?: UserRole;

  @ApiPropertyOptional({
    description: 'تصفية حسب حالة التفعيل (true / false)',
    example: true,
  })
  @IsOptional()
  @ToBoolean()
  @IsBoolean({ message: 'حالة التفعيل يجب أن تكون قيمة منطقية.' })
  readonly isActive?: boolean;
}
