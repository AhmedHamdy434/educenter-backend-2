import {
  IsArray,
  IsNotEmpty,
  IsString,
  IsOptional,
  IsDateString,
} from 'class-validator';

export class GroupStudentsDto {
  @IsNotEmpty({ message: 'قائمة الطلاب مطلوبة.' })
  @IsArray({ message: 'يجب أن تكون قائمة الطلاب عبارة عن مصفوفة.' })
  @IsString({ each: true, message: 'يجب أن يكون كل معرف طالب نصاً.' })
  readonly studentIds: string[];

  @IsOptional()
  @IsDateString({}, { message: 'تاريخ بداية الاشتراك غير صالح.' })
  readonly subscriptionStartDate?: string;
}
