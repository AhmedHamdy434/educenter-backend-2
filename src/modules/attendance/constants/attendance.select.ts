import { Prisma } from '@prisma/client';

export const attendanceStudentUserSelect = {
  id: true,
  fullName: true,
  phone: true,
  avatar: true,
} satisfies Prisma.UserSelect;

export const attendanceExtraSessionInfoSelect = {
  id: true,
  title: true,
  type: true,
  fee: true,
  status: true,
} satisfies Prisma.ExtraSessionSelect;

export const attendanceSessionDetailsSelect = {
  id: true,
  groupId: true,
  date: true,
  extraSessionId: true,
  createdAt: true,
  updatedAt: true,
  extraSession: {
    select: attendanceExtraSessionInfoSelect,
  },
} satisfies Prisma.AttendanceSessionSelect;

export const attendanceGroupStudentSelect = {
  id: true,
  studentId: true,
  groupId: true,
  student: {
    select: {
      id: true,
      code: true,
      user: {
        select: attendanceStudentUserSelect,
      },
    },
  },
} satisfies Prisma.GroupStudentSelect;

export const attendanceExtraStudentSelect = {
  id: true,
  studentId: true,
  extraSessionId: true,
  amountDue: true,
  paid: true,
  isWaived: true,
  paidAt: true,
  notes: true,
  student: {
    select: {
      id: true,
      code: true,
      user: {
        select: attendanceStudentUserSelect,
      },
    },
  },
} satisfies Prisma.ExtraSessionStudentSelect;

export const attendanceSessionWithRecordsSelect = {
  id: true,
  groupId: true,
  date: true,
  extraSessionId: true,
  createdAt: true,
  updatedAt: true,
  records: {
    select: {
      status: true,
    },
  },
} satisfies Prisma.AttendanceSessionSelect;

