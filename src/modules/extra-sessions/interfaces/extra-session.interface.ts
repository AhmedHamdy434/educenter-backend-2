import { AttendanceStatus, Prisma } from '@prisma/client';
import {
  extraSessionDetailsSelect,
  extraSessionListSelect,
  extraSessionStudentSelect,
} from '../constants/extra-session.select';

export type ExtraSessionListItem = Prisma.ExtraSessionGetPayload<{
  select: typeof extraSessionListSelect;
}>;

export type ExtraSessionDetails = Prisma.ExtraSessionGetPayload<{
  select: typeof extraSessionDetailsSelect;
}>;

export type ExtraSessionStudentItem = Prisma.ExtraSessionStudentGetPayload<{
  select: typeof extraSessionStudentSelect;
}>;

export type ExtraSessionStudentWithAttendance = ExtraSessionStudentItem & {
  attendanceStatus: AttendanceStatus | null;
  absenceReason: string | null;
};

export interface ExtraSessionFinancialSummary {
  totalDue: number;
  totalCollected: number;
  remaining: number;
  totalWaived: number;
  studentsCount: number;
  paidCount: number;
  waivedCount: number;
  unpaidCount: number;
}

export interface ExtraSessionsGroupStats {
  totalSessions: number;
  scheduledSessions: number;
  completedSessions: number;
  canceledSessions: number;
  totalCollected: number;
}

export interface ExtraSessionListItemWithSummary extends ExtraSessionListItem {
  financialSummary: ExtraSessionFinancialSummary;
}
