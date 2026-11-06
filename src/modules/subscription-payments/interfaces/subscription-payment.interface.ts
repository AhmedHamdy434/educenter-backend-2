import { Prisma } from '@prisma/client';
import { subscriptionPaymentListSelect } from '../constants/subscription-payment.select';

export type SubscriptionPaymentListItem = Prisma.SubscriptionPaymentGetPayload<{
  select: typeof subscriptionPaymentListSelect;
}>;

export interface MonthlyRevenueBreakdown {
  month: string; // YYYY-MM
  total: string;
}

export interface SubscriptionRevenueSummary {
  totalRevenue: string;
  breakdown: MonthlyRevenueBreakdown[];
}

