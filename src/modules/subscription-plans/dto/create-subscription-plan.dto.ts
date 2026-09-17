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
  @IsNotEmpty()
  @IsString()
  readonly name!: string;

  @IsOptional()
  @IsString()
  readonly description?: string;

  @IsNotEmpty()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @IsPositive()
  readonly price!: number;

  @IsOptional()
  @IsEnum(PlanType, { message: 'نوع الباقة يجب أن يكون MONTHLY أو YEARLY.' })
  readonly type?: PlanType;

  @IsNotEmpty()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  readonly studentLimit!: number;

  @IsNotEmpty()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  readonly teacherLimit!: number;

  @IsOptional()
  @IsBoolean()
  readonly canCreateExams?: boolean;

  @IsOptional()
  @IsBoolean()
  readonly isPopular?: boolean;

  @IsOptional()
  @IsBoolean()
  readonly isActive?: boolean;
}
