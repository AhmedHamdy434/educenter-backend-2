import { Prisma } from '@prisma/client';

export const groupDetails = {
  id: true,
  name: true,
  isActive: true,
  teacherId: true,
  monthlyFee: true,
  startDate: true,
  monthsCount: true,
} satisfies Prisma.GroupSelect;

export const groupListSelect = {
  ...groupDetails,
  capacity: true,
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
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.GroupSelect;

export const groupDetailsSelect = {
  ...groupListSelect,
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
  _count: {
    select: {
      students: true,
      attendanceSessions: true,
    },
  },
} satisfies Prisma.GroupSelect;

export type GroupBasic = Prisma.GroupGetPayload<{
  select: typeof groupDetails;
}>;

export type GroupListItem = Prisma.GroupGetPayload<{
  select: typeof groupListSelect;
}>;

export type GroupDetails = Prisma.GroupGetPayload<{
  select: typeof groupDetailsSelect;
}>;

export const groupEnrolledStudentSelect = {
  id: true,
  studentId: true,
  joinedAt: true,
  subscriptionStartDate: true,
  student: {
    select: {
      id: true,
      code: true,
      parentPhone: true,
      user: {
        select: {
          id: true,
          fullName: true,
          phone: true,
          email: true,
          avatar: true,
        },
      },
    },
  },
} satisfies Prisma.GroupStudentSelect;

export type GroupEnrolledStudent = Prisma.GroupStudentGetPayload<{
  select: typeof groupEnrolledStudentSelect;
}>;
