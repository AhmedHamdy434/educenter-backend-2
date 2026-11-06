import { Prisma } from '@prisma/client';
import { gradeDetailsSelect, gradeListSelect } from '../constants/grade.select';

export type GradeListItem = Prisma.GradeGetPayload<{
  select: typeof gradeListSelect;
}>;

export type GradeDetails = Prisma.GradeGetPayload<{
  select: typeof gradeDetailsSelect;
}>;
