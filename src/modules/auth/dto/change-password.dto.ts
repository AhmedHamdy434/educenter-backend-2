import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString({ message: 'كلمة المرور الحالية يجب أن تكون نصاً.' })
  @IsNotEmpty({ message: 'كلمة المرور الحالية مطلوبة.' })
  readonly currentPassword!: string;

  @IsString({ message: 'كلمة المرور الجديدة يجب أن تكون نصاً.' })
  @IsNotEmpty({ message: 'كلمة المرور الجديدة مطلوبة.' })
  @MinLength(6, { message: 'يجب أن لا تقل كلمة المرور الجديدة عن 6 أحرف.' })
  readonly newPassword!: string;
}
