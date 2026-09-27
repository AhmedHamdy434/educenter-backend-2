import { Prisma } from '@prisma/client';

export const studentListSelect = {
  id: true,
  parentPhone: true,
  createdAt: true,
  centerId: true,
  user: {
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      avatar: true,
      isActive: true,
    },
  },
  enrollments: {
    where: {
      isActive: true,
    },
    select: {
      id: true,
      isActive: true,
      grade: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
} satisfies Prisma.StudentSelect;

export const studentDetailsSelect = {
  ...studentListSelect,
  notes: true,
  updatedAt: true,
  _count: {
    select: {
      groups: true,
      attendance: true,
    },
  },
} satisfies Prisma.StudentSelect;

export type StudentListItem = Prisma.StudentGetPayload<{
  select: typeof studentListSelect;
}>;

export type StudentDetails = Prisma.StudentGetPayload<{
  select: typeof studentDetailsSelect;
}>;
