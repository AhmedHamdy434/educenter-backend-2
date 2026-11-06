import { Prisma } from '@prisma/client';
import {
  studentByCodeSelect,
  studentDetailsSelect,
  studentListSelect,
} from '../constants/student.select';

export type StudentListItem = Prisma.StudentGetPayload<{
  select: typeof studentListSelect;
}>;

export type StudentDetails = Prisma.StudentGetPayload<{
  select: typeof studentDetailsSelect;
}>;

export type StudentByCodeDetails = Prisma.StudentGetPayload<{
  select: typeof studentByCodeSelect;
}>;
