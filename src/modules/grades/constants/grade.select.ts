import { Prisma } from '@prisma/client';

export const gradeDetailsSelect = {
  id: true,
  name: true,
  order: true,
  description: true,
  isActive: true,
  centerId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.GradeSelect;

export const gradeListSelect = {
  id: true,
  name: true,
  order: true,
  description: true,
  isActive: true,
  createdAt: true,
} satisfies Prisma.GradeSelect;

export type GradeDetails = Prisma.GradeGetPayload<{
  select: typeof gradeDetailsSelect;
}>;

export type GradeListItem = Prisma.GradeGetPayload<{
  select: typeof gradeListSelect;
}>;
