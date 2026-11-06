import {
  IsNotEmpty,
  IsString,
  IsNumber,
  Min,
  IsEnum,
  IsOptional,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod, SettlementStatus } from '@prisma/client';

export class SettlementAllocationItemDto {
  @IsNotEmpty({ message: 'معرف بند المستحق مطلوب.' })
  @IsString({ message: 'معرف بند المستحق يجب أن يكون نصاً.' })
  readonly earningEntryId: string;

  @IsNumber({}, { message: 'المبلغ المخصص يجب أن يكون رقماً.' })
  @Min(0.01, { message: 'المبلغ المخصص يجب أن يكون أكبر من الصفر.' })
  @Type(() => Number)
  readonly amount: number;
}

export class CreateSettlementDto {
  @IsNotEmpty({ message: 'معرف المعلم مطلوب.' })
  @IsString({ message: 'معرف المعلم يجب أن يكون نصاً.' })
  readonly teacherId: string;

  @IsNumber({}, { message: 'مبلغ التسوية يجب أن يكون رقماً.' })
  @Min(1, { message: 'مبلغ التسوية يجب أن يكون 1 ج.م على الأقل.' })
  @Type(() => Number)
  readonly amount: number;

  @IsNotEmpty({ message: 'طريقة الدفع مطلوبة.' })
  @IsEnum(PaymentMethod, { message: 'طريقة الدفع غير صالحة.' })
  readonly paymentMethod: PaymentMethod;

  @IsOptional()
  @IsString({ message: 'رقم المرجع يجب أن يكون نصاً.' })
  readonly referenceNumber?: string;

  @IsOptional()
  @IsString({ message: 'الملاحظات يجب أن تكون نصاً.' })
  readonly notes?: string;

  @IsOptional()
  @IsEnum(SettlementStatus, { message: 'حالة التسوية غير صالحة.' })
  readonly status?: SettlementStatus = SettlementStatus.COMPLETED;

  @IsOptional()
  @IsArray({ message: 'قائمة التخصيصات يجب أن تكون مصفوفة.' })
  @ValidateNested({ each: true })
  @Type(() => SettlementAllocationItemDto)
  readonly allocations?: SettlementAllocationItemDto[];
}
