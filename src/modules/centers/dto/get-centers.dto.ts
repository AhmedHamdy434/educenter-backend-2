import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { BaseQueryDto } from '../../../common/dto/BaseQueryDto';
import { ToBoolean } from '../../../common/decorators/to-boolean.decorator';

export class CenterQueryDto extends BaseQueryDto {
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  readonly active?: boolean;

  @IsOptional()
  @IsString()
  declare readonly search?: string;
}
