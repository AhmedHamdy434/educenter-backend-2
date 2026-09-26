import { Module } from '@nestjs/common';
import { CentersService } from './centers.service';
import { CentersController } from './centers.controller';
import { StorageModule } from '../../shared/storage/storage.module';

@Module({
  imports: [StorageModule],
  controllers: [CentersController],
  providers: [CentersService],
})
export class CentersModule {}
