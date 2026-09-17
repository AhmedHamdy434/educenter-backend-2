import { Global, Module } from '@nestjs/common';
import { SubscriptionPlansController } from './subscription-plans.controller';
import { SubscriptionPlansService } from './subscription-plans.service';
import { SubscriptionValidationService } from './subscription-validation.service';
import { SubscriptionExpiryService } from './subscription-expiry.service';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';

@Global()
@Module({
  controllers: [SubscriptionPlansController],
  providers: [
    SubscriptionPlansService,
    SubscriptionValidationService,
    SubscriptionExpiryService,
    SubscriptionGuard,
  ],
  exports: [
    SubscriptionValidationService,
    SubscriptionExpiryService,
    SubscriptionGuard,
  ],
})
export class SubscriptionPlansModule {}
