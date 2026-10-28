import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceStatus } from '@prisma/client';
import { AppRole } from '../../common/enums/app-role.enum';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AttendanceService } from './attendance.service';

describe('AttendanceService - Student Code Support', () => {
  let service: AttendanceService;
  let prisma: {
    group: {
      findFirst: jest.Mock;
    };
    attendanceSession: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
    };
    groupStudent: {
      findMany: jest.Mock;
    };
    studentAttendance: {
      findMany: jest.Mock;
      upsert: jest.Mock;
    };
    student: {
      findMany: jest.Mock;
    };
    teacher: {
      findUnique: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  const centerId = 'center-123';
  const groupId = 'group-123';
  const sessionId = 'session-123';
  const userId = 'user-owner';

  beforeEach(async () => {
    prisma = {
      group: {
        findFirst: jest.fn().mockResolvedValue({
          id: groupId,
          centerId,
          isActive: true,
          teacherId: 'teacher-1',
        }),
      },
      attendanceSession: {
        findFirst: jest.fn().mockResolvedValue({
          id: sessionId,
          groupId,
          centerId,
          date: new Date(),
        }),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
      },
      groupStudent: {
        findMany: jest.fn(),
      },
      studentAttendance: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn(),
      },
      student: {
        findMany: jest.fn(),
      },
      teacher: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(async (cb) => cb(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<AttendanceService>(AttendanceService);
  });

  describe('getSessionDetails', () => {
    it('should return enrolled students with their studentCode', async () => {
      prisma.groupStudent.findMany.mockResolvedValue([
        {
          studentId: 'student-1',
          student: {
            code: 'STU-100234',
            user: {
              fullName: 'أحمد محمود',
              phone: '01012345678',
              avatar: null,
            },
          },
        },
      ]);

      const result = await service.getSessionDetails(
        centerId,
        groupId,
        sessionId,
        AppRole.OWNER,
        userId,
      );

      expect(result.students).toHaveLength(1);
      expect(result.students[0]).toEqual({
        studentId: 'student-1',
        studentCode: 'STU-100234',
        fullName: 'أحمد محمود',
        phone: '01012345678',
        avatar: null,
        status: null,
        absenceReason: null,
      });
    });
  });

  describe('saveAttendance with studentCode', () => {
    it('should resolve studentCode to studentId and save attendance successfully', async () => {
      prisma.student.findMany.mockResolvedValue([
        { id: 'student-1', code: 'STU-100234' },
      ]);
      prisma.groupStudent.findMany.mockResolvedValue([
        { studentId: 'student-1' },
      ]);

      const dto = {
        records: [
          {
            studentCode: '100234',
            status: AttendanceStatus.PRESENT,
          },
        ],
      };

      await service.saveAttendance(
        centerId,
        groupId,
        sessionId,
        dto,
        AppRole.OWNER,
        userId,
      );

      expect(prisma.student.findMany).toHaveBeenCalled();
      expect(prisma.groupStudent.findMany).toHaveBeenCalledWith({
        where: {
          groupId,
          studentId: { in: ['student-1'] },
        },
      });
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.studentAttendance.upsert).toHaveBeenCalledWith({
        where: {
          sessionId_studentId: {
            sessionId,
            studentId: 'student-1',
          },
        },
        create: {
          sessionId,
          studentId: 'student-1',
          status: AttendanceStatus.PRESENT,
          absenceReason: null,
          centerId,
        },
        update: {
          status: AttendanceStatus.PRESENT,
          absenceReason: null,
        },
      });
    });

    it('should throw BadRequestException if neither studentId nor studentCode is provided', async () => {
      const dto = {
        records: [
          {
            status: AttendanceStatus.PRESENT,
          },
        ],
      };

      await expect(
        service.saveAttendance(
          centerId,
          groupId,
          sessionId,
          dto,
          AppRole.OWNER,
          userId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if studentCode does not exist in the center', async () => {
      prisma.student.findMany.mockResolvedValue([]);

      const dto = {
        records: [
          {
            studentCode: 'STU-999999',
            status: AttendanceStatus.PRESENT,
          },
        ],
      };

      await expect(
        service.saveAttendance(
          centerId,
          groupId,
          sessionId,
          dto,
          AppRole.OWNER,
          userId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if student is not enrolled in the group', async () => {
      prisma.student.findMany.mockResolvedValue([
        { id: 'student-foreign', code: 'STU-100999' },
      ]);
      prisma.groupStudent.findMany.mockResolvedValue([]);

      const dto = {
        records: [
          {
            studentCode: 'STU-100999',
            status: AttendanceStatus.PRESENT,
          },
        ],
      };

      await expect(
        service.saveAttendance(
          centerId,
          groupId,
          sessionId,
          dto,
          AppRole.OWNER,
          userId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow saving attendance with ATTENDED_ANOTHER_GROUP status', async () => {
      prisma.student.findMany.mockResolvedValue([
        { id: 'student-1', code: 'STU-100001' },
      ]);
      prisma.groupStudent.findMany.mockResolvedValue([
        { studentId: 'student-1' },
      ]);
      const mockTx = {
        studentAttendance: {
          upsert: jest.fn().mockResolvedValue({ id: 'att-1' }),
        },
      };
      prisma.$transaction.mockImplementation(
        async (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx),
      );

      const dto = {
        records: [
          {
            studentId: 'student-1',
            status: AttendanceStatus.ATTENDED_ANOTHER_GROUP,
            absenceReason: 'حضر مع مجموعة الأحد',
          },
        ],
      };

      const result = await service.saveAttendance(
        centerId,
        groupId,
        sessionId,
        dto,
        AppRole.OWNER,
        userId,
      );

      expect(result.success).toBe(true);
      expect(mockTx.studentAttendance.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            status: AttendanceStatus.ATTENDED_ANOTHER_GROUP,
            absenceReason: 'حضر مع مجموعة الأحد',
          }),
        }),
      );
    });
  });

  describe('getGroupReport with ATTENDED_ANOTHER_GROUP', () => {
    it('should count ATTENDED_ANOTHER_GROUP in attendanceRate and studentStats', async () => {
      prisma.attendanceSession.findMany.mockResolvedValue([{ id: 'sess-1' }]);
      prisma.groupStudent.findMany.mockResolvedValue([
        {
          studentId: 'student-1',
          student: {
            user: { fullName: 'طالب مجتهد' },
          },
        },
      ]);
      prisma.studentAttendance.findMany.mockResolvedValue([
        {
          studentId: 'student-1',
          status: AttendanceStatus.ATTENDED_ANOTHER_GROUP,
        },
      ]);

      const stats = await service.getGroupReport(
        centerId,
        groupId,
        AppRole.OWNER,
        userId,
      );

      expect(stats.attendanceRate).toBe(100);
      expect(stats.perfectAttendance).toHaveLength(1);
      expect(stats.perfectAttendance[0].attendedAnotherGroup).toBe(1);
      expect(stats.perfectAttendance[0].absent).toBe(0);
    });
  });

  describe('getGroupSessions', () => {
    it('should return sessions with attendedCount (present, late, attended another group) and breakdown stats', async () => {
      prisma.attendanceSession.findMany.mockResolvedValue([
        {
          id: 'sess-1',
          groupId,
          centerId,
          date: new Date('2026-10-25'),
          createdAt: new Date(),
          updatedAt: new Date(),
          records: [
            { status: AttendanceStatus.PRESENT },
            { status: AttendanceStatus.LATE },
            { status: AttendanceStatus.ATTENDED_ANOTHER_GROUP },
            { status: AttendanceStatus.ABSENT },
            { status: AttendanceStatus.EXCUSED },
          ],
        },
      ]);

      const sessions = await service.getGroupSessions(
        centerId,
        groupId,
        AppRole.OWNER,
        userId,
      );

      expect(sessions).toHaveLength(1);
      expect(sessions[0].attendedCount).toBe(3); // PRESENT (1) + LATE (1) + ATTENDED_ANOTHER_GROUP (1)
      expect(sessions[0]._count.records).toBe(5);
      expect(sessions[0].stats).toEqual({
        present: 1,
        late: 1,
        attendedAnotherGroup: 1,
        absent: 1,
        excused: 1,
      });
    });

    it('should handle a group with no sessions gracefully', async () => {
      prisma.attendanceSession.findMany.mockResolvedValue([]);

      const sessions = await service.getGroupSessions(
        centerId,
        groupId,
        AppRole.OWNER,
        userId,
      );

      expect(sessions).toEqual([]);
    });

    it('should handle sessions that have no attendance records recorded yet', async () => {
      prisma.attendanceSession.findMany.mockResolvedValue([
        {
          id: 'sess-empty',
          groupId,
          centerId,
          date: new Date('2026-10-27'),
          createdAt: new Date(),
          updatedAt: new Date(),
          records: [],
        },
      ]);

      const sessions = await service.getGroupSessions(
        centerId,
        groupId,
        AppRole.OWNER,
        userId,
      );

      expect(sessions).toHaveLength(1);
      expect(sessions[0].attendedCount).toBe(0);
      expect(sessions[0]._count.records).toBe(0);
      expect(sessions[0].stats).toEqual({
        present: 0,
        late: 0,
        attendedAnotherGroup: 0,
        absent: 0,
        excused: 0,
      });
    });
  });

  describe('startOrGetSession concurrency', () => {
    it('should catch P2002 unique constraint error and return existing session', async () => {
      const existingSession = {
        id: 'session-concurrent-123',
        groupId,
        centerId,
        date: new Date(),
      };

      prisma.attendanceSession.findUnique
        .mockResolvedValueOnce(null) // first check: not found
        .mockResolvedValueOnce(existingSession); // second check after race condition

      prisma.attendanceSession.create.mockRejectedValueOnce({
        code: 'P2002',
        message: 'Unique constraint failed',
      });

      const result = await service.startOrGetSession(
        centerId,
        groupId,
        AppRole.OWNER,
        userId,
      );

      expect(result).toEqual(existingSession);
      expect(prisma.attendanceSession.create).toHaveBeenCalled();
      expect(prisma.attendanceSession.findUnique).toHaveBeenCalledTimes(2);
    });
  });

  describe('saveAttendance deduplication', () => {
    it('should deduplicate records by studentId taking the latest record', async () => {
      prisma.groupStudent.findMany.mockResolvedValue([
        { studentId: 'student-1' },
      ]);

      await service.saveAttendance(
        centerId,
        groupId,
        sessionId,
        {
          records: [
            {
              studentId: 'student-1',
              status: AttendanceStatus.ABSENT,
            },
            {
              studentId: 'student-1',
              status: AttendanceStatus.PRESENT,
            },
          ],
        },
        AppRole.OWNER,
        userId,
      );

      expect(prisma.studentAttendance.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.studentAttendance.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            studentId: 'student-1',
            status: AttendanceStatus.PRESENT,
          }),
        }),
      );
    });
  });
});

