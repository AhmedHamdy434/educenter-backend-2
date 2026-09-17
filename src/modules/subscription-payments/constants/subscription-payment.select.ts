import { Prisma } from '@prisma/client';

export const subscriptionPaymentListSelect = {
  id: true,
  centerSubscriptionId: true,
  centerId: true,
  paid: true,
  periodStart: true,
  periodEnd: true,
  paymentMethod: true,
  notes: true,
  createdAt: true,
  center: {
    select: {
      id: true,
      name: true,
      slug: true,
      email: true,
      phone: true,
    },
  },
  centerSubscription: {
    select: {
      id: true,
      status: true,
      subscriptionPlan: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
} satisfies Prisma.SubscriptionPaymentSelect;

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
