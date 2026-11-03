import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class AddExtraSessionStudentsDto {
  @IsArray({ message: 'معرفات الطلاب يجب أن تكون مصفوفة.' })
  @ArrayNotEmpty({ message: 'يجب تحديد طالب واحد على الأقل للإضافة.' })
  @IsString({ each: true, message: 'كل معرف طالب يجب أن يكون نصاً صالحاً.' })
  readonly studentIds!: string[];
}
