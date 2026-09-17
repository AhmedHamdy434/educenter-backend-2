import { PartialType } from '@nestjs/mapped-types';
import { CreateGroupDto } from './create-group.dto';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateGroupDto extends PartialType(CreateGroupDto) {
  @IsOptional()
  @IsBoolean({ message: 'يجب أن تكون حالة التفعيل قيمة منطقية.' })
  readonly isActive?: boolean;
}
