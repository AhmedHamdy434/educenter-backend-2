import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class AddExtraSessionStudentsDto {
  @ApiProperty({
    description: 'قائمة معرفات الطلاب المطلوب إضافتهم للحصة الإضافية',
    example: ['student-cuid-1', 'student-cuid-2'],
    type: [String],
  })
  @IsArray({ message: 'معرفات الطلاب يجب أن تكون مصفوفة.' })
  @ArrayNotEmpty({ message: 'يجب تحديد طالب واحد على الأقل للإضافة.' })
  @IsString({ each: true, message: 'كل معرف طالب يجب أن يكون نصاً صالحاً.' })
  readonly studentIds!: string[];
}
