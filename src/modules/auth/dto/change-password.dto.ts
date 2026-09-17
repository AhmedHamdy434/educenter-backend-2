import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({
    description: 'كلمة المرور الحالية',
    example: 'OldP@ssword123',
  })
  @IsString({ message: 'كلمة المرور الحالية يجب أن تكون نصاً.' })
  @IsNotEmpty({ message: 'كلمة المرور الحالية مطلوبة.' })
  readonly currentPassword!: string;

  @ApiProperty({
    description: 'كلمة المرور الجديدة (6 أحرف على الأقل)',
    example: 'NewP@ssword456',
    minLength: 6,
  })
  @IsString({ message: 'كلمة المرور الجديدة يجب أن تكون نصاً.' })
  @IsNotEmpty({ message: 'كلمة المرور الجديدة مطلوبة.' })
  @MinLength(6, { message: 'يجب أن لا تقل كلمة المرور الجديدة عن 6 أحرف.' })
  readonly newPassword!: string;
}
