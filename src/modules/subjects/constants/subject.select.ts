import { Prisma } from '@prisma/client';

export const subjectListSelect = {
  id: true,
  name: true,
  description: true,
  isActive: true,
  createdAt: true,
  gradeId: true,
} satisfies Prisma.SubjectSelect;

export const subjectDetailsSelect = {
  ...subjectListSelect,
  centerId: true,
  grade: {
    select: {
      id: true,
      name: true,
    },
  },
  _count: {
    select: {
      teacherSubjects: true,
      groups: true,
    },
  },
  updatedAt: true,
} satisfies Prisma.SubjectSelect;

export type SubjectDetails = Prisma.SubjectGetPayload<{
  select: typeof subjectDetailsSelect;
}>;

export type SubjectListItem = Prisma.SubjectGetPayload<{
  select: typeof subjectListSelect;
}>;
