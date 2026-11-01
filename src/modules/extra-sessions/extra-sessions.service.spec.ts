import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import {
  ExtraSessionAudience,
  ExtraSessionStatus,
  ExtraSessionType,
  Prisma,
} from '@prisma/client';
import { ExtraSessionsService } from './extra-sessions.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { WhatsAppService } from '../notifications/whatsapp.service';

describe('ExtraSessionsService', () => {
  let service: ExtraSessionsService;
  let prisma: any;
  let auditLogsService: { log: jest.Mock };
  let whatsappService: { sendMessage: jest.Mock };

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

    auditLogsService = {
      log: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    };

    whatsappService = {
      sendMessage: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExtraSessionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogsService, useValue: auditLogsService },
        { provide: WhatsAppService, useValue: whatsappService },
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
      durationMinutes: 60,
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

    it('should return warnings and not create session when conflicts exist and force is false', async () => {
      prisma.group.findFirst.mockResolvedValue({
        id: groupId,
        centerId,
        isActive: true,
        teacherId: 'teacher-1',
        schedule: [],
      });

      // Teacher has another group at the same time
      prisma.group.findMany.mockResolvedValue([
        {
          id: 'group-2',
          name: 'مجموعة الكيمياء 2',
          schedule: [{ id: 's-1', hour: 16, minute: 0 }],
        },
      ]);
      prisma.extraSession.findMany.mockResolvedValue([]);

      const result = await service.create(centerId, groupId, validDto, userId);

      expect(result.created).toBe(false);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.length).toBeGreaterThan(0);
      expect(result.warnings![0].code).toBe('TEACHER_SCHEDULE_CONFLICT');
      expect(prisma.extraSession.create).not.toHaveBeenCalled();
    });

    it('should create extra session when force is true despite warnings', async () => {
      prisma.group.findFirst.mockResolvedValue({
        id: groupId,
        centerId,
        isActive: true,
        teacherId: 'teacher-1',
        schedule: [],
      });

      // Conflict exists
      prisma.group.findMany.mockResolvedValue([
        {
          id: 'group-2',
          name: 'مجموعة الكيمياء 2',
          schedule: [{ id: 's-1', hour: 16, minute: 0 }],
        },
      ]);
      prisma.extraSession.findMany.mockResolvedValue([]);

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

      const result = await service.create(
        centerId,
        groupId,
        { ...validDto, force: true },
        userId,
      );

      expect(result.created).toBe(true);
      expect(prisma.extraSession.create).toHaveBeenCalled();
      expect(prisma.attendanceSession.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          extraSessionId: 'es-1',
          groupId,
          centerId,
        }),
      });
      expect(prisma.extraSessionStudent.createMany).toHaveBeenCalled();
      expect(auditLogsService.log).toHaveBeenCalled();
    });
  });

  describe('payStudent', () => {
    it('should record cash payment and dispatch WhatsApp receipt', async () => {
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
      expect(auditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PAYMENT_COLLECTION',
        }),
      );
      expect(whatsappService.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          to: '01012345678',
        }),
      );
    });

    it('should throw BadRequestException if student is already waived', async () => {
      prisma.extraSessionStudent.findUnique.mockResolvedValue({
        id: 'ess-1',
        extraSessionId: 'es-1',
        studentId: 'student-1',
        centerId,
        amountDue: new Prisma.Decimal(0),
        isWaived: true,
        paid: null,
        extraSession: { status: ExtraSessionStatus.SCHEDULED, group: {} },
        student: { user: {} },
      });

      await expect(
        service.payStudent(centerId, 'es-1', 'student-1', {}, userId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if student has already paid', async () => {
      prisma.extraSessionStudent.findUnique.mockResolvedValue({
        id: 'ess-1',
        extraSessionId: 'es-1',
        studentId: 'student-1',
        centerId,
        amountDue: new Prisma.Decimal(50),
        isWaived: false,
        paid: new Prisma.Decimal(50),
        extraSession: { status: ExtraSessionStatus.SCHEDULED, group: {} },
        student: { user: {} },
      });

      await expect(
        service.payStudent(centerId, 'es-1', 'student-1', {}, userId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('waiveStudent', () => {
    it('should waive unpaid student and set amountDue to 0', async () => {
      prisma.extraSessionStudent.findUnique.mockResolvedValue({
        id: 'ess-1',
        centerId,
        isWaived: false,
        paid: null,
      });

      prisma.extraSessionStudent.update.mockResolvedValue({
        id: 'ess-1',
        isWaived: true,
        amountDue: new Prisma.Decimal(0),
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
            amountDue: expect.any(Prisma.Decimal),
          }),
        }),
      );
      expect(auditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'STATUS_CHANGE',
        }),
      );
    });

    it('should throw BadRequestException if student already paid', async () => {
      prisma.extraSessionStudent.findUnique.mockResolvedValue({
        id: 'ess-1',
        centerId,
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

    it('should cancel session when refund notes provided, keep records, and send WhatsApp without refund note', async () => {
      prisma.extraSession.findFirst.mockResolvedValue({
        id: 'es-1',
        centerId,
        status: ExtraSessionStatus.SCHEDULED,
        date: new Date('2026-11-05T00:00:00.000Z'),
        hour: 16,
        minute: 0,
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
      });

      const result = await service.cancel(
        centerId,
        'es-1',
        { confirmRefundNotes: 'تم رد المبلغ في السنتر' },
        userId,
      );

      expect(result.success).toBe(true);
      expect(prisma.extraSession.update).toHaveBeenCalledWith({
        where: { id: 'es-1' },
        data: { status: ExtraSessionStatus.CANCELED },
      });
      expect(auditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'STATUS_CHANGE',
          details: expect.objectContaining({
            confirmRefundNotes: 'تم رد المبلغ في السنتر',
          }),
        }),
      );
      // WhatsApp message should not leak internal refund notes
      expect(whatsappService.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          to: '01011112222',
          message: expect.not.stringContaining('تم رد المبلغ في السنتر'),
        }),
      );
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

    it('should update fee only for unpaid non-waived students', async () => {
      prisma.extraSession.findFirst.mockResolvedValue({
        id: 'es-1',
        centerId,
        fee: new Prisma.Decimal(40),
        status: ExtraSessionStatus.SCHEDULED,
        participants: [],
      });

      prisma.extraSession.update.mockResolvedValue({ id: 'es-1' });

      // For findOne
      jest.spyOn(service, 'findOne').mockResolvedValue({} as any);

      await service.update(centerId, 'es-1', { fee: 60 }, userId);

      expect(prisma.extraSessionStudent.updateMany).toHaveBeenCalledWith({
        where: {
          extraSessionId: 'es-1',
          paid: null,
          isWaived: false,
        },
        data: {
          amountDue: expect.any(Prisma.Decimal),
        },
      });
    });
  });
});
