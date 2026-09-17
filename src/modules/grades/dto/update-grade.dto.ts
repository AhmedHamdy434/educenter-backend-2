import { PartialType } from '@nestjs/mapped-types';
import { CreateGradeDto } from './create-grade.dto';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateGradeDto extends PartialType(CreateGradeDto) {
  @IsOptional()
  @IsBoolean({ message: 'يجب أن تكون حالة التفعيل قيمة منطقية.' })
  readonly isActive?: boolean;
}
