import { Prisma } from '@prisma/client';

export const gradeListSelect = {
  id: true,
  name: true,
  order: true,
  description: true,
  isActive: true,
  centerId: true,
  createdAt: true,
} satisfies Prisma.GradeSelect;

export const gradeDetailsSelect = {
  ...gradeListSelect,
  _count: {
    select: {
      subjects: true,
      groups: true,
      enrollments: true,
    },
  },
} satisfies Prisma.GradeSelect;

export type GradeListItem = Prisma.GradeGetPayload<{
  select: typeof gradeListSelect;
}>;

export type GradeDetails = Prisma.GradeGetPayload<{
  select: typeof gradeDetailsSelect;
}>;
