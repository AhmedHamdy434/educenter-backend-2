import { Module } from '@nestjs/common';
import { OwnerDashboardController } from './owner-dashboard.controller';
import { OwnerDashboardService } from './owner-dashboard.service';

@Module({
  controllers: [OwnerDashboardController],
  providers: [OwnerDashboardService],
  exports: [OwnerDashboardService],
})
export class OwnerDashboardModule {}
