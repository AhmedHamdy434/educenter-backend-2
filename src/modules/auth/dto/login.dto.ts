import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description:
      'البريد الإلكتروني أو رقم الهاتف (بالنسبة لمستخدمي المراكز) أو البريد الإلكتروني للمدير العام',
    example: 'superadmin@educenter.com',
  })
  @IsNotEmpty()
  @IsString()
  readonly identifier!: string;

  @ApiProperty({
    description: 'كلمة المرور',
    example: 'P@ssword123',
  })
  @IsNotEmpty()
  @IsString()
  readonly password!: string;
}
