import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { BaseQueryDto } from '../../../common/dto/BaseQueryDto';
import { ToBoolean } from '../../../common/decorators/to-boolean.decorator';

export class GroupQueryDto extends BaseQueryDto {
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  readonly active?: boolean;

  @IsOptional()
  @IsString()
  readonly gradeId?: string;

  @IsOptional()
  @IsString()
  readonly subjectId?: string;

  @IsOptional()
  @IsString()
  readonly teacherId?: string;

  @IsOptional()
  @IsString()
  declare readonly search?: string;
}
