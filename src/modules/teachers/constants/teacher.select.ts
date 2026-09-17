import { Prisma } from '@prisma/client';

export const teacherDetailsSelect = {
  id: true,
  specialization: true,
  salary: true,
  bio: true,
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
  subjects: {
    select: {
      id: true,
      subject: {
        select: {
          id: true,
          name: true,
          gradeId: true,
        },
      },
    },
  },
} satisfies Prisma.TeacherSelect;

export const teacherListSelect = {
  id: true,
  specialization: true,
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
  subjects: {
    select: {
      id: true,
      subject: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
} satisfies Prisma.TeacherSelect;

export type TeacherDetails = Prisma.TeacherGetPayload<{
  select: typeof teacherDetailsSelect;
}>;

export type TeacherListItem = Prisma.TeacherGetPayload<{
  select: typeof teacherListSelect;
}>;
