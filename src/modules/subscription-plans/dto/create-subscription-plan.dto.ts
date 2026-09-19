import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';
import { PlanType } from '../../../common/enums/plan-type.enum';

export class CreateSubscriptionPlanDto {
  @ApiProperty({
    description: 'اسم باقة الاشتراك الفريد',
    example: 'الباقة المتقدمة',
  })
  @IsNotEmpty()
  @IsString()
  readonly name!: string;

  @ApiPropertyOptional({
    description: 'وصف ومميزات الباقة',
    example: 'باقة مخصصة للمراكز المتوسطة تشمل حتى 500 طالب و 20 معلم',
  })
  @IsOptional()
  @IsString()
  readonly description?: string;

  @ApiProperty({
    description: 'سعر الباقة الأساسي',
    example: 1500,
    minimum: 1,
  })
  @IsNotEmpty()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @IsPositive()
  readonly price!: number;

  @ApiPropertyOptional({
    description: 'دورة تجديد الباقة (MONTHLY أو YEARLY)',
    enum: PlanType,
    default: PlanType.MONTHLY,
    example: PlanType.MONTHLY,
  })
  @IsOptional()
  @IsEnum(PlanType, { message: 'نوع الباقة يجب أن يكون MONTHLY أو YEARLY.' })
  readonly type?: PlanType;

  @ApiProperty({
    description: 'الحد الأقصى لعدد الطلاب المسموح به في المركز ضمن هذه الباقة',
    example: 500,
    minimum: 0,
  })
  @IsNotEmpty()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  readonly studentLimit!: number;

  @ApiProperty({
    description:
      'الحد الأقصى لعدد المعلمين المسموح به في المركز ضمن هذه الباقة',
    example: 20,
    minimum: 0,
  })
  @IsNotEmpty()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  readonly teacherLimit!: number;

  @ApiPropertyOptional({
    description: 'هل تتيح الباقة للمركز إنشاء وإدارة الامتحانات؟',
    default: false,
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  readonly canCreateExams?: boolean;

  @ApiPropertyOptional({
    description: 'هل يتم إبراز الباقة كباقة شائعة/موصى بها؟',
    default: false,
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  readonly isPopular?: boolean;

  @ApiPropertyOptional({
    description: 'حالة تفعيل الباقة للاشتراك الجديد',
    default: true,
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  readonly isActive?: boolean;
}
