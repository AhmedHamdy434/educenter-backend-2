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
      phone: true,
    },
  },
} satisfies Prisma.SubscriptionPaymentSelect;
