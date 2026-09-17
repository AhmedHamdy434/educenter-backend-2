import { Prisma } from '@prisma/client';

export const studentDetailsSelect = {
  id: true,
  parentPhone: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
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
  enrollments: {
    select: {
      id: true,
      isActive: true,
      enrollmentDate: true,
      grade: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
} satisfies Prisma.StudentSelect;

export const studentListSelect = {
  id: true,
  parentPhone: true,
  createdAt: true,
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

export type StudentDetails = Prisma.StudentGetPayload<{
  select: typeof studentDetailsSelect;
}>;

export type StudentListItem = Prisma.StudentGetPayload<{
  select: typeof studentListSelect;
}>;
