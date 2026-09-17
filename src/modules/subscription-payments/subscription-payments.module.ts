import { Module } from '@nestjs/common';
import { SubscriptionPaymentsService } from './subscription-payments.service';
import { SubscriptionPaymentsController } from './subscription-payments.controller';
import { CenterSubscriptionPaymentsController } from './center-subscription-payments.controller';

@Module({
  controllers: [
    SubscriptionPaymentsController,
    CenterSubscriptionPaymentsController,
  ],
  providers: [SubscriptionPaymentsService],
  exports: [SubscriptionPaymentsService],
})
export class SubscriptionPaymentsModule {}
