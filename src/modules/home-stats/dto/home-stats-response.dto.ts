export class HomeStatsResponseDto {
  readonly totalRevenue: number;

  readonly totalCenters: number;

  readonly activeCenters: number;

  readonly graceCenters: number;

  readonly expiredCenters: number;

  readonly suspendedCenters: number;

  readonly activePlans: number;

  readonly totalPlans: number;
}
