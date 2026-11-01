import { Injectable } from '@nestjs/common';
import { DayOfWeek, ExtraSessionStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import {
  addMonths,
  getCairoDateParts,
  getCairoDateString,
  getCairoMonthRange,
  getTodayMidnightUtcInCairo,
} from '../../common/utils/date.util';
import { GetCalendarScheduleDto } from './dto/get-calendar-schedule.dto';
import { GetUpcomingScheduleDto } from './dto/get-upcoming-schedule.dto';
import {
  AttendanceSessionStatus,
  CalendarScheduleResponseData,
  ScheduleSessionItem,
  UpcomingScheduleResponseData,
} from './interfaces/schedule-item.interface';
import {
  scheduleGroupSelect,
  scheduleAttendanceSessionSelect,
  ScheduleGroupEntity,
  ScheduleAttendanceSessionEntity,
} from './constants/schedule.select';

const JS_TO_DAY_OF_WEEK: Record<number, DayOfWeek> = {
  0: DayOfWeek.SUNDAY,
  1: DayOfWeek.MONDAY,
  2: DayOfWeek.TUESDAY,
  3: DayOfWeek.WEDNESDAY,
  4: DayOfWeek.THURSDAY,
  5: DayOfWeek.FRIDAY,
  6: DayOfWeek.SATURDAY,
};

@Injectable()
export class ScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * جلب جدول الحصص لشهر كامل مفردة على أيامه لوضع الـ Calendar
   */
  async getCalendarSchedule(
    centerId: string,
    query: GetCalendarScheduleDto,
  ): Promise<CalendarScheduleResponseData> {
    const monthRange = getCairoMonthRange(query.month);
    const mm = String(monthRange.month + 1).padStart(2, '0');
    const rangeFrom = `${monthRange.year}-${mm}-01`;
    const rangeTo = `${monthRange.year}-${mm}-${String(monthRange.daysInMonth).padStart(2, '0')}`;

    const sessions = await this.expandScheduleForRange(
      centerId,
      monthRange.startDate,
      monthRange.endDate,
      query,
    );

    return {
      month: query.month,
      range: {
        from: rangeFrom,
        to: rangeTo,
      },
      sessions,
    };
  }

  /**
   * جلب الحصص القادمة لوضع الـ Accordion بدءاً من اليوم حتى نهاية الشهر الحالي
   */
  async getUpcomingSchedule(
    centerId: string,
    query: GetUpcomingScheduleDto,
  ): Promise<UpcomingScheduleResponseData> {
    const todayParts = getCairoDateParts();
    const todayMidnight = getTodayMidnightUtcInCairo();
    const currentMonthStr = `${todayParts.year}-${String(todayParts.month + 1).padStart(2, '0')}`;
    const monthRange = getCairoMonthRange(currentMonthStr);

    const rangeFrom = getCairoDateString();
    const rangeTo = `${monthRange.year}-${String(monthRange.month + 1).padStart(2, '0')}-${String(monthRange.daysInMonth).padStart(2, '0')}`;

    const sessions = await this.expandScheduleForRange(
      centerId,
      todayMidnight,
      monthRange.endDate,
      query,
    );

    return {
      range: {
        from: rangeFrom,
        to: rangeTo,
      },
      sessions,
    };
  }

  /**
   * المنطق الأساسي لتوسيع الحصص على نطاق زمني محدد مع ربط الجلسات بـ Single Query
   */
  private async expandScheduleForRange(
    centerId: string,
    startDate: Date,
    endDate: Date,
    filters: {
      teacherId?: string;
      gradeId?: string;
      subjectId?: string;
      groupId?: string;
    },
  ): Promise<ScheduleSessionItem[]> {
    // 1. استعلام المجموعات المؤهلة مع فلاترها
    const groups = await this.prisma.group.findMany({
      where: {
        centerId,
        ...(filters.teacherId ? { teacherId: filters.teacherId } : {}),
        ...(filters.gradeId ? { gradeId: filters.gradeId } : {}),
        ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
        ...(filters.groupId ? { id: filters.groupId } : {}),
        startDate: { lte: endDate },
        OR: [
          { isActive: true },
          {
            attendanceSessions: {
              some: {
                date: { gte: startDate, lte: endDate },
              },
            },
          },
        ],
      },
      select: scheduleGroupSelect,
    });

    const groupsMap = new Map<string, ScheduleGroupEntity>(
      groups.map((g) => [g.id, g]),
    );

    // 2. استعلام الجلسات المنعقدة للسنتر في النطاق الزمني بـ Single Query
    const attendanceSessions = await this.prisma.attendanceSession.findMany({
      where: {
        centerId,
        date: { gte: startDate, lte: endDate },
        ...(filters.groupId ? { groupId: filters.groupId } : {}),
        ...(filters.teacherId
          ? { group: { teacherId: filters.teacherId } }
          : {}),
        ...(filters.gradeId ? { group: { gradeId: filters.gradeId } } : {}),
        ...(filters.subjectId
          ? { group: { subjectId: filters.subjectId } }
          : {}),
      },
      select: scheduleAttendanceSessionSelect,
    });

    // خريطة الجلسات بمفتاح: groupId_dateString
    const sessionsByGroupAndDate = new Map<
      string,
      ScheduleAttendanceSessionEntity
    >();
    for (const session of attendanceSessions) {
      const dateStr = getCairoDateString(session.date);
      sessionsByGroupAndDate.set(`${session.groupId}_${dateStr}`, session);
    }

    const matchedSessionIds = new Set<string>();
    const resultSessions: ScheduleSessionItem[] = [];

    // 3. التكرار على الأيام في المدى الزمني
    const cur = new Date(startDate.getTime());
    while (cur.getTime() <= endDate.getTime()) {
      const curParts = getCairoDateParts(cur);
      const mm = String(curParts.month + 1).padStart(2, '0');
      const dd = String(curParts.day).padStart(2, '0');
      const dateStr = `${curParts.year}-${mm}-${dd}`;
      const dayOfWeek = JS_TO_DAY_OF_WEEK[curParts.dayOfWeek];

      for (const group of groups) {
        const groupEndDate = addMonths(group.startDate, group.monthsCount);
        const isWithinGroupLifetime =
          cur.getTime() >= group.startDate.getTime() &&
          cur.getTime() <= groupEndDate.getTime();

        const matchingSlots = group.schedule.filter(
          (slot) => slot.day === dayOfWeek,
        );

        if (matchingSlots.length > 0) {
          const session = sessionsByGroupAndDate.get(`${group.id}_${dateStr}`);

          // إذا كانت المجموعة غير نشطة أو انتهت مدتها، تظهر فقط إذا كان لها جلسة فعلية
          if ((!group.isActive || !isWithinGroupLifetime) && !session) {
            continue;
          }

          if (session) {
            matchedSessionIds.add(session.id);
          }

          const studentsCount = group._count.students;
          const recordedCount = session ? session._count.records : 0;
          const attendanceStatus = this.calculateAttendanceStatus(
            session ? session.id : null,
            recordedCount,
            studentsCount,
          );

          // إضافة كارت لكل فترة (Slot) مجدولة
          for (const slot of matchingSlots) {
            resultSessions.push({
              id: `slot-${group.id}-${dateStr}-${slot.hour}-${slot.minute}`,
              groupId: group.id,
              groupName: group.name,
              subject: group.subject,
              grade: group.grade,
              teacher: {
                id: group.teacher.id,
                fullName: group.teacher.user.fullName,
                avatar: group.teacher.user.avatar,
              },
              date: dateStr,
              dayOfWeek,
              hour: slot.hour,
              minute: slot.minute,
              sessionId: session ? session.id : null,
              attendanceStatus,
              studentsCount,
              recordedCount,
              isExtraSession: false,
              isGroupInactive: !group.isActive,
            });
          }
        }
      }

      // الانتقال لليوم التالي
      cur.setUTCDate(cur.getUTCDate() + 1);
    }

    // 4. الجلسات السابقة غير المجدولة (تُعرض كجلسات عادية كما كانت extraSessionId = null)
    for (const session of attendanceSessions) {
      if (!matchedSessionIds.has(session.id)) {
        const group = groupsMap.get(session.groupId);
        if (!group) continue;

        const dateStr = getCairoDateString(session.date);
        const sessionParts = getCairoDateParts(session.date);
        const dayOfWeek = JS_TO_DAY_OF_WEEK[sessionParts.dayOfWeek];

        const defaultSlot = group.schedule[0];
        const hour = defaultSlot ? defaultSlot.hour : 12;
        const minute = defaultSlot ? defaultSlot.minute : 0;

        const studentsCount = group._count.students;
        const recordedCount = session._count.records;
        const attendanceStatus = this.calculateAttendanceStatus(
          session.id,
          recordedCount,
          studentsCount,
        );

        resultSessions.push({
          id: `regular-session-${session.id}`,
          groupId: group.id,
          groupName: group.name,
          subject: group.subject,
          grade: group.grade,
          teacher: {
            id: group.teacher.id,
            fullName: group.teacher.user.fullName,
            avatar: group.teacher.user.avatar,
          },
          date: dateStr,
          dayOfWeek,
          hour,
          minute,
          sessionId: session.id,
          attendanceStatus,
          studentsCount,
          recordedCount,
          isExtraSession: false,
          isGroupInactive: !group.isActive,
        });
      }
    }

    // 5. الحصص الإضافية الفعلية من الموديل الحقيقي ExtraSession
    const extraSessions = await this.prisma.extraSession.findMany({
      where: {
        centerId,
        date: { gte: startDate, lte: endDate },
        status: { not: ExtraSessionStatus.CANCELED },
        ...(filters.groupId ? { groupId: filters.groupId } : {}),
        ...(filters.teacherId
          ? { group: { teacherId: filters.teacherId } }
          : {}),
        ...(filters.gradeId ? { group: { gradeId: filters.gradeId } } : {}),
        ...(filters.subjectId
          ? { group: { subjectId: filters.subjectId } }
          : {}),
      },
      include: {
        group: {
          select: scheduleGroupSelect,
        },
        participants: {
          select: { id: true },
        },
        attendanceSession: {
          select: {
            id: true,
            _count: {
              select: { records: true },
            },
          },
        },
      },
    });

    for (const es of extraSessions) {
      const dateStr = getCairoDateString(es.date);
      const sessionParts = getCairoDateParts(es.date);
      const dayOfWeek = JS_TO_DAY_OF_WEEK[sessionParts.dayOfWeek];
      const studentsCount = es.participants.length;
      const recordedCount = es.attendanceSession?._count.records ?? 0;
      const attendanceStatus = this.calculateAttendanceStatus(
        es.attendanceSession?.id ?? null,
        recordedCount,
        studentsCount,
      );

      resultSessions.push({
        id: `extra-session-${es.id}`,
        extraSessionId: es.id,
        groupId: es.groupId,
        groupName: es.group.name,
        subject: es.group.subject,
        grade: es.group.grade,
        teacher: {
          id: es.group.teacher.id,
          fullName: es.group.teacher.user.fullName,
          avatar: es.group.teacher.user.avatar,
        },
        date: dateStr,
        dayOfWeek,
        hour: es.hour,
        minute: es.minute,
        sessionId: es.attendanceSession?.id ?? null,
        attendanceStatus,
        studentsCount,
        recordedCount,
        isExtraSession: true,
        isGroupInactive: !es.group.isActive,
        title: es.title,
        type: es.type,
        fee: Number(es.fee),
        extraSessionStatus: es.status,
      });
    }

    // 5. الترتيب: حسب التاريخ تصاعدياً ثم الساعة ثم الدقيقة ثم اسم المجموعة
    resultSessions.sort((a, b) => {
      if (a.date !== b.date) {
        return a.date.localeCompare(b.date);
      }
      if (a.hour !== b.hour) {
        return a.hour - b.hour;
      }
      if (a.minute !== b.minute) {
        return a.minute - b.minute;
      }
      return a.groupName.localeCompare(b.groupName);
    });

    return resultSessions;
  }

  /**
   * حساب حالة الحضور وفقاً للقواعد المعتمدة
   */
  private calculateAttendanceStatus(
    sessionId: string | null,
    recordedCount: number,
    studentsCount: number,
  ): AttendanceSessionStatus {
    if (!sessionId) {
      return 'NOT_STARTED';
    }
    if (recordedCount === 0) {
      return 'NOT_STARTED';
    }
    if (studentsCount > 0 && recordedCount >= studentsCount) {
      return 'COMPLETED';
    }
    return 'IN_PROGRESS';
  }
}
