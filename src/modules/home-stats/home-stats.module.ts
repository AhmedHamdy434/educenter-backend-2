import { Module } from '@nestjs/common';
import { HomeStatsController } from './home-stats.controller';
import { HomeStatsService } from './home-stats.service';

@Module({
  controllers: [HomeStatsController],
  providers: [HomeStatsService],
  exports: [HomeStatsService],
})
export class HomeStatsModule {}
