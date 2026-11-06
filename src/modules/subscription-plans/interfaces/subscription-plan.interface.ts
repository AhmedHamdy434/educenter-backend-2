import { Prisma, SubscriptionPlan } from '@prisma/client';
import { subscriptionPlanSelect } from '../constants/subscription-plan.select';

export type SubscriptionPlanItem = Prisma.SubscriptionPlanGetPayload<{
  select: typeof subscriptionPlanSelect;
}>;

export interface SubscriptionValidationResult {
  subscriptionPlan: SubscriptionPlan;
  isGracePeriod: boolean;
  isExpired: boolean;
  remainingGraceDays?: number;
  warningHeader?: string;
}
