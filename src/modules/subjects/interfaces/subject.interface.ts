import { Prisma } from '@prisma/client';
import {
  subjectDetailsSelect,
  subjectListSelect,
} from '../constants/subject.select';

export type SubjectDetails = Prisma.SubjectGetPayload<{
  select: typeof subjectDetailsSelect;
}>;

export type SubjectListItem = Prisma.SubjectGetPayload<{
  select: typeof subjectListSelect;
}>;

