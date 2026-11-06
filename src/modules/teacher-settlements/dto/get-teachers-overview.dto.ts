import { IsOptional, IsString } from 'class-validator';

export class GetTeachersOverviewDto {
  @IsOptional()
  @IsString({ message: 'كلمة البحث يجب أن تكون نصاً.' })
  readonly search?: string;
}
