import { BadRequestException, NotFoundException } from '@nestjs/common';
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
      findMany: jest.Mock;
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
        findMany: jest.fn(),
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
      ).rejects.toThrow(
        new BadRequestException(
          'لا يمكن تسجيل الحضور لطلاب غير مقيدين بهذه المجموعة.',
        ),
      );
    });
  });
});
