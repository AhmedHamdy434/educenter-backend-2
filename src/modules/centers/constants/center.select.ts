import { Prisma } from '@prisma/client';

export const centerListSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  logo: true,
  email: true,
  phone: true,
  address: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  subscriptions: {
    where: {
      status: 'ACTIVE',
    },
    select: {
      id: true,
      customPrice: true,
      startDate: true,
      endDate: true,
      status: true,
      subscriptionPlan: {
        select: {
          id: true,
          name: true,
          description: true,
          image: true,
          price: true,
          type: true,
          studentLimit: true,
          teacherLimit: true,
          canCreateExams: true,
        },
      },
    },
    orderBy: {
      endDate: 'desc',
    },
    take: 1,
  },
} satisfies Prisma.CenterSelect;

export const centerDetailsSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  logo: true,
  email: true,
  phone: true,
  address: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  users: {
    where: {
      role: 'OWNER',
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      avatar: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  },
  subscriptions: {
    where: {
      status: 'ACTIVE',
    },
    select: {
      id: true,
      customPrice: true,
      startDate: true,
      endDate: true,
      status: true,
      subscriptionPlan: {
        select: {
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
        },
      },
    },
    orderBy: {
      endDate: 'desc',
    },
    take: 1,
  },
} satisfies Prisma.CenterSelect;

export type CenterDetails = Prisma.CenterGetPayload<{
  select: typeof centerDetailsSelect;
}>;

export type CenterListItem = Prisma.CenterGetPayload<{
  select: typeof centerListSelect;
}>;
