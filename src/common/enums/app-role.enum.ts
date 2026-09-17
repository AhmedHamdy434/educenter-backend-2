import { UserRole } from '@prisma/client';

export const AppRole = {
  SUPER_ADMIN: 'SUPER_ADMIN',

  OWNER: UserRole.OWNER,
  TEACHER: UserRole.TEACHER,
  STUDENT: UserRole.STUDENT,
} as const;

export type AppRole = (typeof AppRole)[keyof typeof AppRole];
