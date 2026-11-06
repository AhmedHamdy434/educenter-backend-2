import { Module } from '@nestjs/common';
import { OwnerSettingsController } from './owner-settings.controller';
import { OwnerSettingsService } from './owner-settings.service';

@Module({
  controllers: [OwnerSettingsController],
  providers: [OwnerSettingsService],
  exports: [OwnerSettingsService],
})
export class OwnerSettingsModule {}
