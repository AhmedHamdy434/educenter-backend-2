import { Test, TestingModule } from '@nestjs/testing';
import { DayOfWeek } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { ScheduleService } from './schedule.service';
import {
  getCairoDateString,
  getCairoDateParts,
} from '../../common/utils/date.util';

describe('ScheduleService', () => {
  let service: ScheduleService;
  let prisma: {
    group: {
      findMany: jest.Mock;
    };
    attendanceSession: {
      findMany: jest.Mock;
    };
    extraSession: {
      findMany: jest.Mock;
    };
  };

  const centerId = 'center-123';

  beforeEach(async () => {
    prisma = {
      group: {
        findMany: jest.fn(),
      },
      attendanceSession: {
        findMany: jest.fn(),
      },
      extraSession: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScheduleService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<ScheduleService>(ScheduleService);
  });

  describe('getCalendarSchedule', () => {
    it('should expand group schedules across the target month correctly', async () => {
      // Group with Sunday (10:00) and Tuesday (16:00) schedule in October 2026
      const mockGroup = {
        id: 'group-1',
        name: 'مجموعة الفيزياء 1',
        isActive: true,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        monthsCount: 6,
        grade: { id: 'grade-1', name: 'الصف الأول الثانوي' },
        subject: { id: 'subj-1', name: 'الفيزياء' },
        teacher: {
          id: 'teacher-1',
          user: { fullName: 'أ. أحمد علي', avatar: null },
        },
        schedule: [
          { id: 'slot-1', day: DayOfWeek.SUNDAY, hour: 10, minute: 0 },
          { id: 'slot-2', day: DayOfWeek.TUESDAY, hour: 16, minute: 30 },
        ],
        _count: { students: 20 },
      };

      prisma.group.findMany.mockResolvedValue([mockGroup]);
      prisma.attendanceSession.findMany.mockResolvedValue([]);

      const result = await service.getCalendarSchedule(centerId, {
        month: '2026-10',
      });

      expect(result.month).toBe('2026-10');
      expect(result.range.from).toBe('2026-10-01');
      expect(result.range.to).toBe('2026-10-31');

      // October 2026 has:
      // Sundays: 4, 11, 18, 25 (4 days)
      // Tuesdays: 6, 13, 20, 27 (4 days)
      // Total 8 sessions
      expect(result.sessions.length).toBe(8);

      const firstSession = result.sessions[0];
      expect(firstSession.date).toBe('2026-10-04'); // First Sunday
      expect(firstSession.dayOfWeek).toBe(DayOfWeek.SUNDAY);
      expect(firstSession.hour).toBe(10);
      expect(firstSession.minute).toBe(0);
      expect(firstSession.sessionId).toBeNull();
      expect(firstSession.attendanceStatus).toBe('NOT_STARTED');
      expect(firstSession.studentsCount).toBe(20);
      expect(firstSession.recordedCount).toBe(0);
      expect(firstSession.isExtraSession).toBe(false);
      expect(firstSession.isGroupInactive).toBe(false);
    });

    it('should calculate attendance status accurately (NOT_STARTED, IN_PROGRESS, COMPLETED)', async () => {
      const mockGroup = {
        id: 'group-1',
        name: 'مجموعة الكيمياء',
        isActive: true,
        startDate: new Date('2026-10-01T00:00:00.000Z'),
        monthsCount: 3,
        grade: { id: 'grade-1', name: 'الصف الثاني الثانوي' },
        subject: { id: 'subj-1', name: 'الكيمياء' },
        teacher: {
          id: 'teacher-1',
          user: { fullName: 'د. سامي', avatar: null },
        },
        schedule: [
          { id: 'slot-1', day: DayOfWeek.SATURDAY, hour: 12, minute: 0 },
        ],
        _count: { students: 10 },
      };

      // 3 Saturdays in Oct 2026: Oct 3 (no session), Oct 10 (session with 5 recorded), Oct 17 (session with 10 recorded)
      const mockSessions = [
        {
          id: 'session-empty',
          groupId: 'group-1',
          centerId,
          date: new Date('2026-10-10T00:00:00.000Z'), // 0 records
          _count: { records: 0 },
        },
        {
          id: 'session-partial',
          groupId: 'group-1',
          centerId,
          date: new Date('2026-10-17T00:00:00.000Z'), // 5/10 records -> IN_PROGRESS
          _count: { records: 5 },
        },
        {
          id: 'session-full',
          groupId: 'group-1',
          centerId,
          date: new Date('2026-10-24T00:00:00.000Z'), // 10/10 records -> COMPLETED
          _count: { records: 10 },
        },
      ];

      prisma.group.findMany.mockResolvedValue([mockGroup]);
      prisma.attendanceSession.findMany.mockResolvedValue(mockSessions);

      const result = await service.getCalendarSchedule(centerId, {
        month: '2026-10',
      });

      const oct3 = result.sessions.find((s) => s.date === '2026-10-03');
      const oct10 = result.sessions.find((s) => s.date === '2026-10-10');
      const oct17 = result.sessions.find((s) => s.date === '2026-10-17');
      const oct24 = result.sessions.find((s) => s.date === '2026-10-24');

      expect(oct3?.attendanceStatus).toBe('NOT_STARTED');
      expect(oct3?.sessionId).toBeNull();

      expect(oct10?.attendanceStatus).toBe('NOT_STARTED'); // session exists but recordedCount = 0
      expect(oct10?.sessionId).toBe('session-empty');
      expect(oct10?.recordedCount).toBe(0);

      expect(oct17?.attendanceStatus).toBe('IN_PROGRESS'); // 5 of 10
      expect(oct17?.sessionId).toBe('session-partial');
      expect(oct17?.recordedCount).toBe(5);

      expect(oct24?.attendanceStatus).toBe('COMPLETED'); // 10 of 10
      expect(oct24?.sessionId).toBe('session-full');
      expect(oct24?.recordedCount).toBe(10);
    });

    it('should generate multiple separate cards for groups with multiple slots on the same day', async () => {
      const mockGroup = {
        id: 'group-multi',
        name: 'مجموعة مكثفة',
        isActive: true,
        startDate: new Date('2026-10-01T00:00:00.000Z'),
        monthsCount: 2,
        grade: { id: 'grade-1', name: 'الصف الثالث الثانوي' },
        subject: { id: 'subj-1', name: 'اللغة العربية' },
        teacher: {
          id: 'teacher-1',
          user: { fullName: 'أ. طارق', avatar: null },
        },
        schedule: [
          { id: 'slot-morning', day: DayOfWeek.MONDAY, hour: 10, minute: 0 },
          { id: 'slot-evening', day: DayOfWeek.MONDAY, hour: 17, minute: 30 },
        ],
        _count: { students: 15 },
      };

      const mockSession = {
        id: 'session-oct-5',
        groupId: 'group-multi',
        centerId,
        date: new Date('2026-10-05T00:00:00.000Z'),
        _count: { records: 15 },
      };

      prisma.group.findMany.mockResolvedValue([mockGroup]);
      prisma.attendanceSession.findMany.mockResolvedValue([mockSession]);

      const result = await service.getCalendarSchedule(centerId, {
        month: '2026-10',
      });

      const mondaySessions = result.sessions.filter(
        (s) => s.date === '2026-10-05',
      );
      expect(mondaySessions.length).toBe(2);

      const morning = mondaySessions.find((s) => s.hour === 10);
      const evening = mondaySessions.find((s) => s.hour === 17);

      expect(morning).toBeDefined();
      expect(evening).toBeDefined();
      expect(morning?.minute).toBe(0);
      expect(evening?.minute).toBe(30);

      // Both cards reference the same session and counts
      expect(morning?.sessionId).toBe('session-oct-5');
      expect(evening?.sessionId).toBe('session-oct-5');
      expect(morning?.attendanceStatus).toBe('COMPLETED');
      expect(evening?.attendanceStatus).toBe('COMPLETED');
    });

    it('should include makeup/extra sessions with isExtraSession: true', async () => {
      const mockGroup = {
        id: 'group-1',
        name: 'مجموعة الرياضيات',
        isActive: true,
        startDate: new Date('2026-10-01T00:00:00.000Z'),
        monthsCount: 1,
        grade: { id: 'grade-1', name: 'الصف الأول الإعدادي' },
        subject: { id: 'subj-1', name: 'الرياضيات' },
        teacher: {
          id: 'teacher-1',
          user: { fullName: 'أ. خالد', avatar: null },
        },
        schedule: [
          // Regularly scheduled only on Fridays
          { id: 'slot-fri', day: DayOfWeek.FRIDAY, hour: 14, minute: 0 },
        ],
        _count: { students: 12 },
      };

      // Real extra session from ExtraSession model
      const realExtraSession = {
        id: 'es-1',
        title: 'حصة إضافية للمراجعة',
        type: 'REVISION',
        fee: 50,
        status: 'SCHEDULED',
        hour: 16,
        minute: 30,
        date: new Date('2026-10-07T00:00:00.000Z'),
        groupId: 'group-1',
        group: mockGroup,
        participants: [{ id: 'p-1' }, { id: 'p-2' }],
        attendanceSession: {
          id: 'session-makeup',
          _count: { records: 2 },
        },
      };

      prisma.group.findMany.mockResolvedValue([mockGroup]);
      prisma.attendanceSession.findMany.mockResolvedValue([]);
      prisma.extraSession.findMany.mockResolvedValue([realExtraSession]);

      const result = await service.getCalendarSchedule(centerId, {
        month: '2026-10',
      });

      const makeupCard = result.sessions.find((s) => s.date === '2026-10-07');
      expect(makeupCard).toBeDefined();
      expect(makeupCard?.isExtraSession).toBe(true);
      expect(makeupCard?.dayOfWeek).toBe(DayOfWeek.WEDNESDAY);
      expect(makeupCard?.sessionId).toBe('session-makeup');
      expect(makeupCard?.attendanceStatus).toBe('COMPLETED');
      expect(makeupCard?.fee).toBe(50);
      expect(makeupCard?.title).toBe('حصة إضافية للمراجعة');
    });

    it('should exclude inactive groups without sessions and include inactive groups with existing sessions (faded)', async () => {
      const inactiveGroupWithoutSession = {
        id: 'group-inactive-empty',
        name: 'مجموعة موقوفة بدون جلسة',
        isActive: false,
        startDate: new Date('2026-10-01T00:00:00.000Z'),
        monthsCount: 1,
        grade: { id: 'grade-1', name: 'الصف الأول' },
        subject: { id: 'subj-1', name: 'المادة' },
        teacher: {
          id: 'teacher-1',
          user: { fullName: 'معلم', avatar: null },
        },
        schedule: [
          { id: 'slot-1', day: DayOfWeek.SATURDAY, hour: 10, minute: 0 },
        ],
        _count: { students: 5 },
      };

      const inactiveGroupWithSession = {
        id: 'group-inactive-with-session',
        name: 'مجموعة موقوفة مع جلسة',
        isActive: false,
        startDate: new Date('2026-10-01T00:00:00.000Z'),
        monthsCount: 1,
        grade: { id: 'grade-1', name: 'الصف الأول' },
        subject: { id: 'subj-1', name: 'المادة' },
        teacher: {
          id: 'teacher-1',
          user: { fullName: 'معلم', avatar: null },
        },
        schedule: [
          { id: 'slot-2', day: DayOfWeek.SATURDAY, hour: 12, minute: 0 },
        ],
        _count: { students: 8 },
      };

      const recordedSession = {
        id: 'session-for-inactive',
        groupId: 'group-inactive-with-session',
        centerId,
        date: new Date('2026-10-03T00:00:00.000Z'),
        _count: { records: 8 },
      };

      prisma.group.findMany.mockResolvedValue([
        inactiveGroupWithoutSession,
        inactiveGroupWithSession,
      ]);
      prisma.attendanceSession.findMany.mockResolvedValue([recordedSession]);

      const result = await service.getCalendarSchedule(centerId, {
        month: '2026-10',
      });

      // Group without session should not have any slots
      const emptyGroupSlots = result.sessions.filter(
        (s) => s.groupId === 'group-inactive-empty',
      );
      expect(emptyGroupSlots.length).toBe(0);

      // Group with session should have its session slot marked as isGroupInactive: true
      const inactiveGroupSlots = result.sessions.filter(
        (s) => s.groupId === 'group-inactive-with-session',
      );
      expect(inactiveGroupSlots.length).toBe(1);
      expect(inactiveGroupSlots[0].date).toBe('2026-10-03');
      expect(inactiveGroupSlots[0].isGroupInactive).toBe(true);
      expect(inactiveGroupSlots[0].sessionId).toBe('session-for-inactive');
    });

    it('should filter groups by subjectId, teacherId, gradeId, and groupId', async () => {
      prisma.group.findMany.mockResolvedValue([]);
      prisma.attendanceSession.findMany.mockResolvedValue([]);

      await service.getCalendarSchedule(centerId, {
        month: '2026-10',
        subjectId: 'subj-123',
        teacherId: 'teacher-123',
        gradeId: 'grade-123',
        groupId: 'group-123',
      });

      expect(prisma.group.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            centerId,
            subjectId: 'subj-123',
            teacherId: 'teacher-123',
            gradeId: 'grade-123',
            id: 'group-123',
          }),
        }),
      );
    });
  });

  describe('getUpcomingSchedule', () => {
    it('should generate upcoming sessions starting strictly from today to the end of the current month', async () => {
      const todayDateStr = getCairoDateString();
      const todayParts = getCairoDateParts();

      const mockGroup = {
        id: 'group-1',
        name: 'مجموعة المستقبل',
        isActive: true,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        monthsCount: 12,
        grade: { id: 'grade-1', name: 'الصف الثالث' },
        subject: { id: 'subj-1', name: 'الأحياء' },
        teacher: {
          id: 'teacher-1',
          user: { fullName: 'د. منى', avatar: null },
        },
        schedule: [
          // All 7 days
          { id: 's-0', day: DayOfWeek.SUNDAY, hour: 10, minute: 0 },
          { id: 's-1', day: DayOfWeek.MONDAY, hour: 10, minute: 0 },
          { id: 's-2', day: DayOfWeek.TUESDAY, hour: 10, minute: 0 },
          { id: 's-3', day: DayOfWeek.WEDNESDAY, hour: 10, minute: 0 },
          { id: 's-4', day: DayOfWeek.THURSDAY, hour: 10, minute: 0 },
          { id: 's-5', day: DayOfWeek.FRIDAY, hour: 10, minute: 0 },
          { id: 's-6', day: DayOfWeek.SATURDAY, hour: 10, minute: 0 },
        ],
        _count: { students: 10 },
      };

      prisma.group.findMany.mockResolvedValue([mockGroup]);
      prisma.attendanceSession.findMany.mockResolvedValue([]);

      const result = await service.getUpcomingSchedule(centerId, {});

      expect(result.range.from).toBe(todayDateStr);
      // All returned sessions must be >= todayDateStr
      for (const session of result.sessions) {
        expect(session.date >= todayDateStr).toBe(true);
      }
    });
  });
});
