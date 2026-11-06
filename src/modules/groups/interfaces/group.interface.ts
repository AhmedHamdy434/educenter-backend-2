import { Prisma } from '@prisma/client';
import {
  groupDetails,
  groupDetailsSelect,
  groupEnrolledStudentSelect,
  groupListSelect,
} from '../constants/group.select';

export type GroupBasic = Prisma.GroupGetPayload<{
  select: typeof groupDetails;
}>;

export type GroupListItem = Prisma.GroupGetPayload<{
  select: typeof groupListSelect;
}>;

export type GroupDetails = Prisma.GroupGetPayload<{
  select: typeof groupDetailsSelect;
}>;

export type GroupEnrolledStudent = Prisma.GroupStudentGetPayload<{
  select: typeof groupEnrolledStudentSelect;
}>;
