import { AttendanceStatus, Prisma } from '@prisma/client';
import {
  attendanceExtraStudentSelect,
  attendanceGroupStudentSelect,
  attendanceSessionDetailsSelect,
  attendanceSessionWithRecordsSelect,
} from '../constants/attendance.select';

export type AttendanceSessionDetails = Prisma.AttendanceSessionGetPayload<{
  select: typeof attendanceSessionDetailsSelect;
}>;

export type AttendanceSessionWithRecords = Prisma.AttendanceSessionGetPayload<{
  select: typeof attendanceSessionWithRecordsSelect;
}>;

export type AttendanceGroupStudentItem = Prisma.GroupStudentGetPayload<{
  select: typeof attendanceGroupStudentSelect;
}>;

export type AttendanceExtraStudentItem = Prisma.ExtraSessionStudentGetPayload<{
  select: typeof attendanceExtraStudentSelect;
}>;

export interface AttendanceStudentSessionItem {
  studentId: string;
  studentCode: string;
  fullName: string;
  phone: string | null;
  avatar: string | null;
  status: AttendanceStatus | null;
  absenceReason: string | null;
  extraSessionInfo?: {
    amountDue: number;
    paid: number | null;
    isWaived: boolean;
    paidAt: string | null;
    notes: string | null;
  };
}

export interface AttendanceSessionStats {
  total: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  attendedAnotherGroup: number;
}

export interface AttendanceSessionFullDetails {
  session: AttendanceSessionDetails;
  students: AttendanceStudentSessionItem[];
  stats: AttendanceSessionStats;
}

export interface AttendanceGroupReport {
  totalSessions: number;
  totalStudents: number;
  attendanceRate: number;
  highestAbsence: {
    studentId: string;
    fullName: string;
    absenceCount: number;
  }[];
  perfectAttendance: {
    studentId: string;
    fullName: string;
    attendanceCount: number;
  }[];
  extraSessions?: {
    totalSessions: number;
    present: number;
    absent: number;
  };
}

export interface StudentAttendanceStats {
  totalSessions: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  attendedAnotherGroup: number;
  attendanceRate: number;
}

export interface StudentAttendanceReport {
  sessions: any[];
  stats: StudentAttendanceStats;
  extraSessionsStats?: {
    totalSessions: number;
    present: number;
    absent: number;
    late: number;
    excused: number;
    attendedAnotherGroup: number;
  };
}
