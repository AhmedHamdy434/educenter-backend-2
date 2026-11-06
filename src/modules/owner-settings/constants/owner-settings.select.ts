import { Prisma } from '@prisma/client';

export const centerSettingsSelect = {
  id: true,
  centerId: true,
  centerSharePercentage: true,
  teacherSharePercentage: true,
  allowStudentCreditAdvance: true,
  currency: true,
  receiptNotes: true,
  updatedAt: true,
} satisfies Prisma.CenterSettingsSelect;
