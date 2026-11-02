import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import {
  AttendanceStatus,
  ExtraSessionAudience,
  ExtraSessionStatus,
  ExtraSessionType,
  Prisma,
} from '@prisma/client';
import { ExtraSessionsService } from './extra-sessions.service';
import { PrismaService } from '../../database/prisma/prisma.service';

describe('ExtraSessionsService', () => {
  let service: ExtraSessionsService;
  let prisma: any;

  const centerId = 'center-1';
  const groupId = 'group-1';
  const userId = 'user-owner-1';

  beforeEach(async () => {
    prisma = {
      group: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      groupStudent: {
        findMany: jest.fn(),
      },
      extraSession: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      extraSessionStudent: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        createMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      attendanceSession: {
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      studentAttendance: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn(async (cb: (tx: any) => Promise<any>) =>
        cb(prisma),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExtraSessionsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<ExtraSessionsService>(ExtraSessionsService);
  });

  describe('create', () => {
    const validDto = {
      title: 'مراجعة الباب الأول',
      type: ExtraSessionType.REVISION,
      audience: ExtraSessionAudience.ALL_GROUP,
      date: '2026-11-05',
      hour: 16,
      minute: 30,
      fee: 50,
      notes: 'ملاحظات هامة',
    };

    it('should throw BadRequestException if group is not active', async () => {
      prisma.group.findFirst.mockResolvedValue({
        id: groupId,
        centerId,
        isActive: false,
        schedule: [],
      });

      await expect(
        service.create(centerId, groupId, validDto, userId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create extra session directly regardless of other schedules', async () => {
      prisma.group.findFirst.mockResolvedValue({
        id: groupId,
        centerId,
        isActive: true,
        teacherId: 'teacher-1',
        schedule: [],
      });

      // Enrolled students
      prisma.groupStudent.findMany.mockResolvedValue([
        { studentId: 'student-1' },
        { studentId: 'student-2' },
      ]);

      prisma.extraSession.create.mockResolvedValue({
        id: 'es-1',
        centerId,
        groupId,
        date: new Date('2026-11-05T00:00:00.000Z'),
        fee: new Prisma.Decimal(50),
      });

      // For findOne
      prisma.extraSession.findFirst.mockResolvedValue({
        id: 'es-1',
        centerId,
        groupId,
        participants: [
          { amountDue: new Prisma.Decimal(50), paid: null, isWaived: false },
          { amountDue: new Prisma.Decimal(50), paid: null, isWaived: false },
        ],
        attendanceSession: { id: 'att-sess-1' },
      });

      const result = await service.create(centerId, groupId, validDto, userId);

      expect(result).toBeDefined();
      expect(result.id).toBe('es-1');
      expect(prisma.extraSession.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          centerId,
          groupId,
          date: expect.any(Date),
          hour: 16,
          minute: 30,
        }),
      });
      expect(prisma.attendanceSession.create).not.toHaveBeenCalled();
      expect(prisma.extraSessionStudent.createMany).toHaveBeenCalled();
    });
  });

  describe('startAttendanceSession', () => {
    it('should throw BadRequestException if session date is in the future', async () => {
      // Future date: 10 days from now
      const futureDate = new Date();
      futureDate.setUTCDate(futureDate.getUTCDate() + 10);

      prisma.extraSession.findFirst.mockResolvedValue({
        id: 'es-future',
        centerId,
        groupId,
        date: futureDate,
        status: ExtraSessionStatus.SCHEDULED,
        group: { id: groupId, isActive: true },
        attendanceSession: null,
      });

      await expect(
        service.startAttendanceSession(
          centerId,
          'es-future',
          'OWNER' as any,
          userId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create and return attendance session if started today or in the past', async () => {
      const todayDate = new Date();

      prisma.extraSession.findFirst.mockResolvedValue({
        id: 'es-today',
        centerId,
        groupId,
        date: todayDate,
        status: ExtraSessionStatus.SCHEDULED,
        group: { id: groupId, isActive: true },
        attendanceSession: null,
      });

      const mockAttendanceSession = {
        id: 'att-sess-created',
        centerId,
        groupId,
        extraSessionId: 'es-today',
        date: todayDate,
      };

      prisma.attendanceSession.create.mockResolvedValue(mockAttendanceSession);

      const result = await service.startAttendanceSession(
        centerId,
        'es-today',
        'OWNER',
        userId,
      );

      expect(result).toEqual(mockAttendanceSession);
      expect(prisma.attendanceSession.create).toHaveBeenCalledWith({
        data: {
          centerId,
          groupId,
          extraSessionId: 'es-today',
          date: todayDate,
        },
      });
    });

    it('should return existing attendance session if already started', async () => {
      const todayDate = new Date();
      const existingAttSession = {
        id: 'att-sess-existing',
        centerId,
        groupId,
        extraSessionId: 'es-today',
        date: todayDate,
      };

      prisma.extraSession.findFirst.mockResolvedValue({
        id: 'es-today',
        centerId,
        groupId,
        date: todayDate,
        status: ExtraSessionStatus.SCHEDULED,
        group: { id: groupId, isActive: true },
        attendanceSession: existingAttSession,
      });

      const result = await service.startAttendanceSession(
        centerId,
        'es-today',
        'OWNER',
        userId,
      );

      expect(result).toEqual(existingAttSession);
      expect(prisma.attendanceSession.create).not.toHaveBeenCalled();
    });

    it('should create extra session attendance session even on a day when group has regular schedule', async () => {
      const todayDate = new Date();

      prisma.extraSession.findFirst.mockResolvedValue({
        id: 'es-on-regular-day',
        centerId,
        groupId,
        date: todayDate,
        status: ExtraSessionStatus.SCHEDULED,
        group: {
          id: groupId,
          isActive: true,
          schedule: [{ day: 'MONDAY', hour: 10, minute: 0 }], // Group has regular schedule
        },
        attendanceSession: null,
      });

      const mockAttendanceSession = {
        id: 'att-extra-session',
        centerId,
        groupId,
        extraSessionId: 'es-on-regular-day',
        date: todayDate,
      };

      prisma.attendanceSession.create.mockResolvedValue(mockAttendanceSession);

      const result = await service.startAttendanceSession(
        centerId,
        'es-on-regular-day',
        'OWNER',
        userId,
      );

      expect(result).toEqual(mockAttendanceSession);
      expect(result.extraSessionId).toBe('es-on-regular-day');
      expect(prisma.attendanceSession.create).toHaveBeenCalledWith({
        data: {
          centerId,
          groupId,
          extraSessionId: 'es-on-regular-day',
          date: todayDate,
        },
      });
    });

    it('should throw BadRequestException if extra session is CANCELED', async () => {
      prisma.extraSession.findFirst.mockResolvedValue({
        id: 'es-canceled',
        centerId,
        groupId,
        date: new Date(),
        status: ExtraSessionStatus.CANCELED,
        group: { id: groupId, isActive: true },
      });

      await expect(
        service.startAttendanceSession(
          centerId,
          'es-canceled',
          'OWNER' as any,
          userId,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findOne', () => {
    it('should return extra session details with attendanceStatus and absenceReason for present and absent participants', async () => {
      prisma.extraSession.findFirst.mockResolvedValue({
        id: 'es-1',
        centerId,
        groupId,
        participants: [
          {
            studentId: 'student-1',
            amountDue: new Prisma.Decimal(50),
            paid: new Prisma.Decimal(50),
            isWaived: false,
          },
          {
            studentId: 'student-2',
            amountDue: new Prisma.Decimal(50),
            paid: null,
            isWaived: false,
          },
        ],
        attendanceSession: { id: 'att-sess-1' },
      });

      prisma.studentAttendance.findMany.mockResolvedValue([
        {
          studentId: 'student-1',
          status: AttendanceStatus.PRESENT,
          absenceReason: 'حضر متأخراً 10 دقائق',
        },
        {
          studentId: 'student-2',
          status: AttendanceStatus.ABSENT,
          absenceReason: 'عذر مرضي مع تقرير طبي',
        },
      ]);

      const result = await service.findOne(centerId, 'es-1');

      expect(result).toBeDefined();
      expect(result.participants).toHaveLength(2);
      expect(result.participants[0].attendanceStatus).toBe(
        AttendanceStatus.PRESENT,
      );
      expect(result.participants[0].absenceReason).toBe('حضر متأخراً 10 دقائق');
      expect(result.participants[1].attendanceStatus).toBe(
        AttendanceStatus.ABSENT,
      );
      expect(result.participants[1].absenceReason).toBe(
        'عذر مرضي مع تقرير طبي',
      );
    });
  });

  describe('payStudent', () => {
    it('should record cash payment and update paidAt', async () => {
      prisma.extraSessionStudent.findUnique.mockResolvedValue({
        id: 'ess-1',
        extraSessionId: 'es-1',
        studentId: 'student-1',
        centerId,
        amountDue: new Prisma.Decimal(50),
        isWaived: false,
        paid: null,
        extraSession: {
          status: ExtraSessionStatus.SCHEDULED,
          title: 'مراجعة نهائية',
          group: { name: 'المجموعة 1' },
        },
        student: {
          parentPhone: '01012345678',
          user: { fullName: 'محمد أحمد' },
        },
      });

      prisma.extraSessionStudent.update.mockResolvedValue({
        id: 'ess-1',
        paid: new Prisma.Decimal(50),
        paidAt: new Date(),
      });

      const result = await service.payStudent(
        centerId,
        'es-1',
        'student-1',
        { amount: 50 },
        userId,
      );

      expect(prisma.extraSessionStudent.update).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should record complementary payment when student already paid part of fee', async () => {
      prisma.extraSessionStudent.findUnique.mockResolvedValue({
        id: 'ess-1',
        extraSessionId: 'es-1',
        studentId: 'student-1',
        centerId,
        amountDue: new Prisma.Decimal(50),
        isWaived: false,
        paid: new Prisma.Decimal(20),
        extraSession: { status: ExtraSessionStatus.SCHEDULED, group: {} },
        student: { user: {} },
      });

      prisma.extraSessionStudent.update.mockResolvedValue({
        id: 'ess-1',
        paid: new Prisma.Decimal(50),
        paidAt: new Date(),
      });

      const result = await service.payStudent(
        centerId,
        'es-1',
        'student-1',
        { amount: 50 },
        userId,
      );

      expect(prisma.extraSessionStudent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            paid: new Prisma.Decimal(50),
            isWaived: false,
          }),
        }),
      );
      expect(result).toBeDefined();
    });

    it('should allow paying after student was previously waived and cancel waiver', async () => {
      prisma.extraSessionStudent.findUnique.mockResolvedValue({
        id: 'ess-1',
        extraSessionId: 'es-1',
        studentId: 'student-1',
        centerId,
        amountDue: new Prisma.Decimal(50),
        isWaived: true,
        paid: null,
        extraSession: { status: ExtraSessionStatus.SCHEDULED, group: {} },
        student: { user: {} },
      });

      prisma.extraSessionStudent.update.mockResolvedValue({
        id: 'ess-1',
        paid: new Prisma.Decimal(50),
        isWaived: false,
      });

      await service.payStudent(
        centerId,
        'es-1',
        'student-1',
        { amount: 50 },
        userId,
      );

      expect(prisma.extraSessionStudent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isWaived: false,
            paid: new Prisma.Decimal(50),
          }),
        }),
      );
    });

    it('should throw BadRequestException if amount exceeds amountDue', async () => {
      prisma.extraSessionStudent.findUnique.mockResolvedValue({
        id: 'ess-1',
        extraSessionId: 'es-1',
        studentId: 'student-1',
        centerId,
        amountDue: new Prisma.Decimal(50),
        isWaived: false,
        paid: null,
        extraSession: { status: ExtraSessionStatus.SCHEDULED, group: {} },
        student: { user: {} },
      });

      await expect(
        service.payStudent(
          centerId,
          'es-1',
          'student-1',
          { amount: 60 },
          userId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if amount is negative', async () => {
      prisma.extraSessionStudent.findUnique.mockResolvedValue({
        id: 'ess-1',
        extraSessionId: 'es-1',
        studentId: 'student-1',
        centerId,
        amountDue: new Prisma.Decimal(50),
        isWaived: false,
        paid: null,
        extraSession: { status: ExtraSessionStatus.SCHEDULED, group: {} },
        student: { user: {} },
      });

      await expect(
        service.payStudent(
          centerId,
          'es-1',
          'student-1',
          { amount: -10 },
          userId,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('waiveStudent', () => {
    it('should waive unpaid student', async () => {
      prisma.extraSessionStudent.findUnique.mockResolvedValue({
        id: 'ess-1',
        centerId,
        amountDue: new Prisma.Decimal(50),
        isWaived: false,
        paid: null,
      });

      prisma.extraSessionStudent.update.mockResolvedValue({
        id: 'ess-1',
        isWaived: true,
      });

      await service.waiveStudent(
        centerId,
        'es-1',
        'student-1',
        { notes: 'إعفاء للتفوق' },
        userId,
      );

      expect(prisma.extraSessionStudent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isWaived: true,
          }),
        }),
      );
    });

    it('should waive student with partial payment (retaining paid amount and waiving remaining)', async () => {
      prisma.extraSessionStudent.findUnique.mockResolvedValue({
        id: 'ess-1',
        centerId,
        amountDue: new Prisma.Decimal(50),
        isWaived: false,
        paid: new Prisma.Decimal(20),
      });

      prisma.extraSessionStudent.update.mockResolvedValue({
        id: 'ess-1',
        isWaived: true,
      });

      await service.waiveStudent(
        centerId,
        'es-1',
        'student-1',
        { notes: 'إعفاء من المتبقي' },
        userId,
      );

      expect(prisma.extraSessionStudent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isWaived: true,
          }),
        }),
      );
    });

    it('should throw BadRequestException if student already paid full fee', async () => {
      prisma.extraSessionStudent.findUnique.mockResolvedValue({
        id: 'ess-1',
        centerId,
        amountDue: new Prisma.Decimal(50),
        isWaived: false,
        paid: new Prisma.Decimal(50),
      });

      await expect(
        service.waiveStudent(centerId, 'es-1', 'student-1', {}, userId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancel', () => {
    it('should throw BadRequestException if session has payments and confirmRefundNotes is missing', async () => {
      prisma.extraSession.findFirst.mockResolvedValue({
        id: 'es-1',
        centerId,
        status: ExtraSessionStatus.SCHEDULED,
        group: { name: 'مجموعة 1' },
        participants: [
          {
            paid: new Prisma.Decimal(50),
            student: { parentPhone: '0100', user: { fullName: 'علي' } },
          },
        ],
      });

      await expect(
        service.cancel(centerId, 'es-1', {}, userId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should cancel session when refund notes provided, store in cancellationNotes with canceledAt, and keep notes untouched', async () => {
      const originalNotes = 'ملاحظات الحصة الأصلية';
      prisma.extraSession.findFirst.mockResolvedValue({
        id: 'es-1',
        centerId,
        status: ExtraSessionStatus.SCHEDULED,
        date: new Date('2026-11-05T00:00:00.000Z'),
        hour: 16,
        minute: 0,
        notes: originalNotes,
        group: { name: 'مجموعة 1' },
        participants: [
          {
            paid: new Prisma.Decimal(50),
            student: { parentPhone: '01011112222', user: { fullName: 'علي' } },
          },
        ],
      });

      prisma.extraSession.update.mockResolvedValue({
        id: 'es-1',
        status: ExtraSessionStatus.CANCELED,
        cancellationNotes: 'تم رد المبلغ نقداً لولي الأمر',
        canceledAt: new Date(),
        notes: originalNotes,
      });

      const result = await service.cancel(
        centerId,
        'es-1',
        { confirmRefundNotes: '  تم رد المبلغ نقداً لولي الأمر  ' },
        userId,
      );

      expect(result.success).toBe(true);
      expect(prisma.extraSession.update).toHaveBeenCalledWith({
        where: { id: 'es-1' },
        data: {
          status: ExtraSessionStatus.CANCELED,
          cancellationNotes: 'تم رد المبلغ نقداً لولي الأمر',
          canceledAt: expect.any(Date),
        },
      });
      const updateData = prisma.extraSession.update.mock.calls[0][0].data;
      expect(updateData).not.toHaveProperty('notes');
    });
  });

  describe('update', () => {
    it('should throw BadRequestException if session is CANCELED', async () => {
      prisma.extraSession.findFirst.mockResolvedValue({
        id: 'es-1',
        centerId,
        status: ExtraSessionStatus.CANCELED,
        participants: [],
      });

      await expect(
        service.update(centerId, 'es-1', { title: 'تعديل' }, userId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if new fee is less than amount already paid by some student', async () => {
      prisma.extraSession.findFirst.mockResolvedValue({
        id: 'es-1',
        centerId,
        fee: new Prisma.Decimal(50),
        status: ExtraSessionStatus.SCHEDULED,
        participants: [
          {
            isWaived: false,
            paid: new Prisma.Decimal(50),
          },
        ],
      });

      await expect(
        service.update(centerId, 'es-1', { fee: 40 }, userId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update fee for all non-waived students when new fee is valid', async () => {
      prisma.extraSession.findFirst.mockResolvedValue({
        id: 'es-1',
        centerId,
        fee: new Prisma.Decimal(40),
        status: ExtraSessionStatus.SCHEDULED,
        participants: [
          {
            isWaived: false,
            paid: new Prisma.Decimal(30),
          },
        ],
      });

      prisma.extraSession.update.mockResolvedValue({ id: 'es-1' });

      // For findOne
      jest.spyOn(service, 'findOne').mockResolvedValue({} as any);

      await service.update(centerId, 'es-1', { fee: 60 }, userId);

      expect(prisma.extraSessionStudent.updateMany).toHaveBeenCalledWith({
        where: {
          extraSessionId: 'es-1',
          isWaived: false,
        },
        data: {
          amountDue: expect.any(Prisma.Decimal),
        },
      });
    });
  });
});
