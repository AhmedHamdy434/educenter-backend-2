import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { BaseQueryDto } from '../../../common/dto/BaseQueryDto';

export class GroupQueryDto extends BaseQueryDto {
  @IsOptional()
  @Transform(({ obj, key }) => {
    const value = (obj as Record<string, unknown>)[key];
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
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
