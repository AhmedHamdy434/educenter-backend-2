import { Prisma } from '@prisma/client';

export const teacherListSelect = {
  id: true,
  createdAt: true,
  user: {
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      avatar: true,
      isActive: true,
      centerId: true,
    },
  },
  subjects: {
    select: {
      id: true,
      subject: {
        select: {
          id: true,
          name: true,
          gradeId: true,
          grade: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.TeacherSelect;

export const teacherDetailsSelect = {
  ...teacherListSelect,
  bio: true,
  updatedAt: true,
  _count: {
    select: {
      groups: true,
      subjects: true,
    },
  },
} satisfies Prisma.TeacherSelect;

export type TeacherListItem = Prisma.TeacherGetPayload<{
  select: typeof teacherListSelect;
}>;

export type TeacherDetails = Prisma.TeacherGetPayload<{
  select: typeof teacherDetailsSelect;
}>;
