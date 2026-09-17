import { Prisma } from '@prisma/client';

export const groupListSelect = {
  id: true,
  name: true,
  capacity: true,
  monthlyFee: true,
  startDate: true,
  monthsCount: true,
  isActive: true,
  centerId: true,
  gradeId: true,
  grade: {
    select: {
      id: true,
      name: true,
    },
  },
  subjectId: true,
  subject: {
    select: {
      id: true,
      name: true,
    },
  },
  teacherId: true,
  teacher: {
    select: {
      id: true,
      user: {
        select: {
          fullName: true,
          avatar: true,
        },
      },
    },
  },
  schedule: {
    select: {
      id: true,
      day: true,
      hour: true,
      minute: true,
    },
  },
  _count: {
    select: {
      students: true,
    },
  },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.GroupSelect;

export const groupDetailsSelect = {
  id: true,
  name: true,
  capacity: true,
  monthlyFee: true,
  startDate: true,
  monthsCount: true,
  isActive: true,
  centerId: true,
  gradeId: true,
  grade: {
    select: {
      id: true,
      name: true,
    },
  },
  subjectId: true,
  subject: {
    select: {
      id: true,
      name: true,
    },
  },
  teacherId: true,
  teacher: {
    select: {
      id: true,
      user: {
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          avatar: true,
        },
      },
    },
  },
  schedule: {
    select: {
      id: true,
      day: true,
      hour: true,
      minute: true,
    },
  },
  students: {
    select: {
      id: true,
      joinedAt: true,
      subscriptionStartDate: true,
      student: {
        select: {
          id: true,
          parentPhone: true,
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              phone: true,
              avatar: true,
            },
          },
        },
      },
    },
  },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.GroupSelect;

export type GroupListItem = Prisma.GroupGetPayload<{
  select: typeof groupListSelect;
}>;

export type GroupDetails = Prisma.GroupGetPayload<{
  select: typeof groupDetailsSelect;
}>;
