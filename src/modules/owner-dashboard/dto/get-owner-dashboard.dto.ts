import { IsDateString, IsEnum, IsOptional } from 'class-validator';

export enum DashboardPeriod {
  TODAY = 'today',
  WEEK = 'week',
  MONTH = 'month',
  YEAR = 'year',
  ALL = 'all',
  CUSTOM = 'custom',
}

export class GetOwnerDashboardDto {
  @IsOptional()
  @IsEnum(DashboardPeriod, { message: 'الفترة الزمنية المحددة غير صالحة.' })
  readonly period?: DashboardPeriod = DashboardPeriod.MONTH;

  @IsOptional()
  @IsDateString({}, { message: 'تاريخ البداية غير صالح.' })
  readonly from?: string;

  @IsOptional()
  @IsDateString({}, { message: 'تاريخ النهاية غير صالح.' })
  readonly to?: string;
}
