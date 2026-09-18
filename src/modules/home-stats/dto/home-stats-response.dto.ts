import { ApiProperty } from '@nestjs/swagger';

export class HomeStatsResponseDto {
  @ApiProperty({
    description: 'إجمالي إيرادات الاشتراكات المحصلة للمنصة (ج.م)',
    example: 35024,
  })
  readonly totalRevenue: number;

  @ApiProperty({
    description: 'إجمالي المراكز التعليمية المسجلة في المنصة',
    example: 4,
  })
  readonly totalCenters: number;

  @ApiProperty({
    description: 'عدد المراكز ذات الاشتراكات السارية (Active)',
    example: 4,
  })
  readonly activeCenters: number;

  @ApiProperty({
    description: 'عدد المراكز في فترة السماح (Grace Period)',
    example: 0,
  })
  readonly graceCenters: number;

  @ApiProperty({
    description: 'عدد المراكز ذات الاشتراكات المنتهية (Read Only)',
    example: 0,
  })
  readonly expiredCenters: number;

  @ApiProperty({
    description: 'عدد المراكز المعطلة يدوياً (Suspended)',
    example: 0,
  })
  readonly suspendedCenters: number;

  @ApiProperty({
    description: 'عدد باقات الاشتراك النشطة المتاحة',
    example: 4,
  })
  readonly activePlans: number;

  @ApiProperty({
    description: 'إجمالي عدد باقات الاشتراك في المنصة',
    example: 4,
  })
  readonly totalPlans: number;
}
