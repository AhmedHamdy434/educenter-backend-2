import { DayOfWeek } from '@prisma/client';

export type AttendanceSessionStatus =
  'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';

export interface ScheduleItemSubject {
  id: string;
  name: string;
}

export interface ScheduleItemGrade {
  id: string;
  name: string;
}

export interface ScheduleItemTeacher {
  id: string;
  fullName: string;
  avatar: string | null;
}

export interface ScheduleSessionItem {
  id: string;
  groupId: string;
  groupName: string;
  subject: ScheduleItemSubject;
  grade: ScheduleItemGrade;
  teacher: ScheduleItemTeacher;
  date: string; // YYYY-MM-DD
  dayOfWeek: DayOfWeek;
  hour: number;
  minute: number;
  sessionId: string | null;
  attendanceStatus: AttendanceSessionStatus;
  studentsCount: number;
  recordedCount: number;
  isExtraSession: boolean;
  extraSessionId: string | null;
  isGroupInactive: boolean;
  title?: string | null;
  type?: string;
  fee?: number;
  extraSessionStatus?: string;
}

export interface CalendarScheduleResponseData {
  month: string; // YYYY-MM
  range: {
    from: string; // YYYY-MM-DD
    to: string; // YYYY-MM-DD
  };
  sessions: ScheduleSessionItem[];
}

export interface UpcomingScheduleResponseData {
  range: {
    from: string; // YYYY-MM-DD
    to: string; // YYYY-MM-DD
  };
  sessions: ScheduleSessionItem[];
}
