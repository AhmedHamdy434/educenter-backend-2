import { Prisma } from '@prisma/client';
import {
  teacherDetailsSelect,
  teacherListSelect,
} from '../constants/teacher.select';

export type TeacherListItem = Prisma.TeacherGetPayload<{
  select: typeof teacherListSelect;
}>;

export type TeacherDetails = Prisma.TeacherGetPayload<{
  select: typeof teacherDetailsSelect;
}>;

