import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateSubjectDto } from './create-subject.dto';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateSubjectDto extends PartialType(
  OmitType(CreateSubjectDto, ['gradeId'] as const),
) {
  @IsOptional()
  @IsBoolean({ message: 'يجب أن تكون حالة التفعيل قيمة منطقية.' })
  readonly isActive?: boolean;
}
