import { SubscriptionType } from '@prisma/client';

export const PlanType = {
  MONTHLY: SubscriptionType.MONTHLY,
  YEARLY: SubscriptionType.YEARLY,
} as const;

export type PlanType = (typeof PlanType)[keyof typeof PlanType];
