import { Prisma } from '@prisma/client';

export const scheduleGroupSelect = {
  id: true,
  name: true,
  isActive: true,
  startDate: true,
  monthsCount: true,
  grade: {
    select: {
      id: true,
      name: true,
    },
  },
  subject: {
    select: {
      id: true,
      name: true,
    },
  },
  teacher: {
    select: {
      id: true,
      user: {
        select: {
          fullName: true,
          avatar: true,
        },
      },
    },
  },
  schedule: {
    select: {
      id: true,
      day: true,
      hour: true,
      minute: true,
    },
  },
  _count: {
    select: {
      students: true,
    },
  },
} satisfies Prisma.GroupSelect;

export type ScheduleGroupEntity = Prisma.GroupGetPayload<{
  select: typeof scheduleGroupSelect;
}>;

export const scheduleAttendanceSessionSelect = {
  id: true,
  groupId: true,
  centerId: true,
  date: true,
  _count: {
    select: {
      records: true,
    },
  },
} satisfies Prisma.AttendanceSessionSelect;

export type ScheduleAttendanceSessionEntity = Prisma.AttendanceSessionGetPayload<{
  select: typeof scheduleAttendanceSessionSelect;
}>;

