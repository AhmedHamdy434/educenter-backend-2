import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExtraSessionAudience, ExtraSessionType } from '@prisma/client';

export class CreateExtraSessionDto {
  @ApiPropertyOptional({
    description: 'عنوان الحصة الإضافية الاختياري',
    example: 'مراجعة ليلة الامتحان - الباب الأول',
  })
  @IsOptional()
  @IsString({ message: 'عنوان الحصة يجب أن يكون نصاً صالحاً.' })
  readonly title?: string;

  @ApiPropertyOptional({
    description: 'نوع الحصة الإضافية',
    enum: ExtraSessionType,
    default: ExtraSessionType.OTHER,
    example: ExtraSessionType.REVISION,
  })
  @IsOptional()
  @IsEnum(ExtraSessionType, { message: 'نوع الحصة الإضافية غير صالح.' })
  readonly type?: ExtraSessionType = ExtraSessionType.OTHER;

  @ApiPropertyOptional({
    description: 'الجمهور المستهدف بالحصة (كل المجموعة أو طلاب محددين)',
    enum: ExtraSessionAudience,
    default: ExtraSessionAudience.ALL_GROUP,
    example: ExtraSessionAudience.ALL_GROUP,
  })
  @IsOptional()
  @IsEnum(ExtraSessionAudience, { message: 'الجمهور المستهدف غير صالح.' })
  readonly audience?: ExtraSessionAudience = ExtraSessionAudience.ALL_GROUP;

  @ApiProperty({
    description: 'تاريخ الحصة بتنسيق YYYY-MM-DD بتوقيت القاهرة',
    example: '2026-11-05',
  })
  @IsNotEmpty({ message: 'تاريخ الحصة مطلوب.' })
  @IsString({ message: 'تاريخ الحصة يجب أن يكون نصاً بتنسيق YYYY-MM-DD.' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'تاريخ الحصة يجب أن يكون بصيغة YYYY-MM-DD.',
  })
  readonly date!: string;

  @ApiProperty({
    description: 'ساعة بدء الحصة بتوقيت 24 ساعة (0 - 23)',
    example: 16,
    minimum: 0,
    maximum: 23,
  })
  @IsNotEmpty({ message: 'ساعة الحصة مطلوبة.' })
  @Type(() => Number)
  @IsInt({ message: 'ساعة الحصة يجب أن تكون عدداً صحيحاً.' })
  @Min(0, { message: 'ساعة الحصة لا يمكن أن تقل عن 0.' })
  @Max(23, { message: 'ساعة الحصة لا يمكن أن تزيد عن 23.' })
  readonly hour!: number;

  @ApiProperty({
    description: 'دقيقة بدء الحصة (0 - 59)',
    example: 30,
    minimum: 0,
    maximum: 59,
  })
  @IsNotEmpty({ message: 'دقيقة الحصة مطلوبة.' })
  @Type(() => Number)
  @IsInt({ message: 'دقيقة الحصة يجب أن تكون عدداً صحيحاً.' })
  @Min(0, { message: 'دقيقة الحصة لا يمكن أن تقل عن 0.' })
  @Max(59, { message: 'دقيقة الحصة لا يمكن أن تزيد عن 59.' })
  readonly minute!: number;

  @ApiPropertyOptional({
    description: 'مدة الحصة بالدقائق (افتراضياً 60 دقيقة)',
    example: 90,
    default: 60,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'مدة الحصة يجب أن تكون عدداً صحيحاً بالدقائق.' })
  @Min(15, { message: 'مدة الحصة لا تقل عن 15 دقيقة.' })
  @Max(360, { message: 'مدة الحصة لا تزيد عن 360 دقيقة.' })
  readonly durationMinutes?: number = 60;

  @ApiPropertyOptional({
    description: 'مكان انعقاد الحصة أو القاعة',
    example: 'قاعة 3 - الدور الأرضي',
  })
  @IsOptional()
  @IsString({ message: 'مكان الحصة يجب أن يكون نصاً صالحاً.' })
  readonly location?: string;

  @ApiPropertyOptional({
    description: 'سعر الحصة للطالب بالجنيه المصري (0 = مجانية)',
    example: 50.0,
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'سعر الحصة يجب أن يكون رقماً صالحاً.' })
  @Min(0, { message: 'سعر الحصة لا يمكن أن يكون سالباً.' })
  readonly fee?: number = 0;

  @ApiPropertyOptional({
    description: 'ملاحظات إضافية حول الحصة',
    example: 'يرجى إحضار ملزمة التدريبات الخاصة بالامتحان.',
  })
  @IsOptional()
  @IsString({ message: 'الملاحظات يجب أن تكون نصاً صالحاً.' })
  readonly notes?: string;

  @ApiPropertyOptional({
    description: 'معرفات الطلاب المشاركين (مطلوب إذا كان الجمهور SELECTED)',
    example: ['student-cuid-1', 'student-cuid-2'],
    type: [String],
  })
  @IsOptional()
  @IsArray({ message: 'معرفات الطلاب يجب أن تكون مصفوفة صالحة.' })
  @IsString({ each: true, message: 'كل معرف طالب يجب أن يكون نصاً صالحاً.' })
  readonly studentIds?: string[];
}
