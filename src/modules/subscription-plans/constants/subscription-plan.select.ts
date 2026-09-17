import { Prisma } from '@prisma/client';

export const subscriptionPlanSelect = {
  id: true,
  name: true,
  description: true,
  image: true,
  price: true,
  type: true,
  studentLimit: true,
  teacherLimit: true,
  canCreateExams: true,
  isPopular: true,
  isActive: true,
  createdAt: true,
  // updatedAt: true,
} satisfies Prisma.SubscriptionPlanSelect;
