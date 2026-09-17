import { IsBoolean, IsNotEmpty } from 'class-validator';

export class UpdateCenterStatusDto {
  @IsNotEmpty()
  @IsBoolean()
  readonly isActive!: boolean;
}
