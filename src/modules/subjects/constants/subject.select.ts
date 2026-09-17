import { Prisma } from '@prisma/client';

export const subjectDetailsSelect = {
  id: true,
  name: true,
  description: true,
  isActive: true,
  centerId: true,
  gradeId: true,
  grade: {
    select: {
      id: true,
      name: true,
    },
  },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.SubjectSelect;

export const subjectListSelect = {
  id: true,
  name: true,
  description: true,
  isActive: true,
  gradeId: true,
  grade: {
    select: {
      id: true,
      name: true,
    },
  },
  createdAt: true,
} satisfies Prisma.SubjectSelect;

export type SubjectDetails = Prisma.SubjectGetPayload<{
  select: typeof subjectDetailsSelect;
}>;

export type SubjectListItem = Prisma.SubjectGetPayload<{
  select: typeof subjectListSelect;
}>;
