import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty } from 'class-validator';

export class UpdateCenterStatusDto {
  @ApiProperty({
    description: 'حالة تفعيل المركز (true للتفعيل، false للتعطيل)',
    example: false,
  })
  @IsNotEmpty()
  @IsBoolean()
  readonly isActive!: boolean;
}
