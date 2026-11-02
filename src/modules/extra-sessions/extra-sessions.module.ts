import { Module } from '@nestjs/common';
import { SubscriptionPlansModule } from '../subscription-plans/subscription-plans.module';
import { ExtraSessionsService } from './extra-sessions.service';
import { GroupExtraSessionsController } from './group-extra-sessions.controller';
import { ExtraSessionsController } from './extra-sessions.controller';

@Module({
  imports: [SubscriptionPlansModule],
  controllers: [GroupExtraSessionsController, ExtraSessionsController],
  providers: [ExtraSessionsService],
  exports: [ExtraSessionsService],
})
export class ExtraSessionsModule {}
