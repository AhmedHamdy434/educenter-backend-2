import { AttendanceStatus, Prisma } from '@prisma/client';

export const extraSessionStudentSelect = {
  id: true,
  extraSessionId: true,
  studentId: true,
  amountDue: true,
  isWaived: true,
  paid: true,
  paidAt: true,
  notes: true,
  student: {
    select: {
      id: true,
      code: true,
      parentPhone: true,
      user: {
        select: {
          fullName: true,
          phone: true,
          avatar: true,
        },
      },
    },
  },
} satisfies Prisma.ExtraSessionStudentSelect;

export const extraSessionListSelect = {
  id: true,
  centerId: true,
  groupId: true,
  title: true,
  type: true,
  audience: true,
  status: true,
  date: true,
  hour: true,
  minute: true,
  durationMinutes: true,
  location: true,
  fee: true,
  notes: true,
  reminderSentAt: true,
  createdAt: true,
  updatedAt: true,
  group: {
    select: {
      id: true,
      name: true,
      subject: { select: { id: true, name: true } },
      grade: { select: { id: true, name: true } },
      teacher: {
        select: {
          id: true,
          user: { select: { fullName: true, avatar: true } },
        },
      },
    },
  },
  attendanceSession: {
    select: {
      id: true,
      _count: {
        select: { records: true },
      },
    },
  },
  _count: {
    select: {
      participants: true,
    },
  },
} satisfies Prisma.ExtraSessionSelect;

export const extraSessionDetailsSelect = {
  ...extraSessionListSelect,
  participants: {
    select: extraSessionStudentSelect,
    orderBy: {
      student: {
        user: {
          fullName: 'asc',
        },
      },
    },
  },
} satisfies Prisma.ExtraSessionSelect;

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

