import { IsEnum, IsOptional, IsString, IsDateString } from 'class-validator';
import { SettlementStatus } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/PaginationDto';

export class GetSettlementsDto extends PaginationDto {
  @IsOptional()
  @IsString({ message: 'معرف المعلم يجب أن يكون نصاً.' })
  readonly teacherId?: string;

  @IsOptional()
  @IsEnum(SettlementStatus, { message: 'حالة التسوية غير صالحة.' })
  readonly status?: SettlementStatus;

  @IsOptional()
  @IsDateString({}, { message: 'تاريخ البدء غير صالح.' })
  readonly from?: string;

  @IsOptional()
  @IsDateString({}, { message: 'تاريخ الانتهاء غير صالح.' })
  readonly to?: string;
}
