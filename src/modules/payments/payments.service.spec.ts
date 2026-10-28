import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { ExcelService } from '../../shared/excel/excel.service';
import { AppRole } from '../../common/enums/app-role.enum';

describe('PaymentsService - Excel Export', () => {
  let service: PaymentsService;
  let prisma: {
    group: {
      findFirst: jest.Mock;
    };
    groupStudent: {
      count: jest.Mock;
      findMany: jest.Mock;
    };
    student: {
      findUnique: jest.Mock;
    };
    monthlyPayment: {
      findMany: jest.Mock;
    };
  };
  let excelService: {
    buildWorkbookBuffer: jest.Mock;
  };

  const centerId = 'center-123';

  beforeEach(async () => {
    prisma = {
      group: {
        findFirst: jest.fn(),
      },
      groupStudent: {
        count: jest.fn(),
        findMany: jest.fn(),
      },
      student: {
        findUnique: jest.fn(),
      },
      monthlyPayment: {
        findMany: jest.fn(),
      },
    };

    excelService = {
      buildWorkbookBuffer: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ExcelService, useValue: excelService },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  describe('exportGroupPaymentsToExcel', () => {
    it('should throw NotFoundException if group does not exist', async () => {
      prisma.group.findFirst.mockResolvedValue(null);

      await expect(
        service.exportGroupPaymentsToExcel(centerId, 'non-existent-group'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should export monthly matrix when group exists', async () => {
      const groupId = 'group-1';
      const startDate = new Date('2026-10-01');

      // First call in exportGroupPaymentsToExcel (validation)
      prisma.group.findFirst
        .mockResolvedValueOnce({
          id: groupId,
          name: 'مجموعة النخبة',
          startDate,
          monthsCount: 2,
        })
        // Second call inside getGroupPayments
        .mockResolvedValueOnce({
          id: groupId,
          name: 'مجموعة النخبة',
          startDate,
          monthsCount: 2,
          monthlyFee: 200,
        });

      prisma.groupStudent.count.mockResolvedValue(1);
      prisma.groupStudent.findMany.mockResolvedValue([
        {
          id: 'gs-1',
          studentId: 'student-1',
          subscriptionStartDate: startDate,
          student: {
            code: 'STU-101',
            user: {
              fullName: 'محمود السيد',
              email: 'mahmoud@test.com',
              phone: '01011112222',
              avatar: null,
            },
          },
          payments: [
            {
              id: 'p-1',
              subscriptionDate: new Date('2026-10-01'),
              amount: 200,
              paidAt: new Date('2026-10-05'),
              notes: null,
            },
          ],
        },
      ]);

      excelService.buildWorkbookBuffer.mockResolvedValue(
        Buffer.from('group-payments-buffer'),
      );

      const result = await service.exportGroupPaymentsToExcel(
        centerId,
        groupId,
      );

      expect(excelService.buildWorkbookBuffer).toHaveBeenCalledWith(
        expect.objectContaining({
          sheetName: 'مجموعة النخبة',
          data: [
            expect.objectContaining({
              fullName: 'محمود السيد',
              phone: '01011112222',
              paidCount: 1,
              unpaidCount: 1,
              'month_2026-10-01': 'مدفوع (200 ج.م)',
              'month_2026-11-01': 'مستحق (غير مدفوع)',
            }),
          ],
        }),
      );

      expect(result).toEqual(Buffer.from('group-payments-buffer'));
    });
  });

  describe('exportStudentPaymentsToExcel', () => {
    it('should export student payments list to Excel buffer', async () => {
      const studentId = 'student-1';

      prisma.student.findUnique.mockResolvedValue({
        id: studentId,
        userId: 'user-student-1',
        user: {
          centerId,
          fullName: 'علي كمال',
        },
      });

      prisma.monthlyPayment.findMany.mockResolvedValue([
        {
          id: 'pay-1',
          subscriptionDate: new Date('2026-10-01'),
          amount: 250,
          paidAt: new Date('2026-10-05'),
          notes: 'دفع نقدي',
          groupStudent: {
            group: {
              id: 'group-1',
              name: 'مجموعة الرياضيات',
            },
          },
        },
      ]);

      excelService.buildWorkbookBuffer.mockResolvedValue(
        Buffer.from('student-payments-buffer'),
      );

      const result = await service.exportStudentPaymentsToExcel(
        centerId,
        studentId,
        AppRole.OWNER,
        'user-1',
      );

      expect(excelService.buildWorkbookBuffer).toHaveBeenCalledWith(
        expect.objectContaining({
          sheetName: 'مدفوعات علي كمال',
          data: [
            expect.objectContaining({
              groupName: 'مجموعة الرياضيات',
              subscriptionDate: '2026-10-01',
              amount: '250 ج.م',
              paidAt: '2026-10-05',
              notes: 'دفع نقدي',
            }),
          ],
        }),
      );

      expect(result).toEqual(Buffer.from('student-payments-buffer'));
    });
  });

  describe('getGroupPayments with search, month filter and pagination', () => {
    it('should paginate and filter by search and month', async () => {
      const groupId = 'group-1';
      const startDate = new Date('2026-10-01');

      prisma.group.findFirst.mockResolvedValue({
        id: groupId,
        name: 'مجموعة النخبة',
        startDate,
        monthsCount: 3,
        monthlyFee: 150,
      });

      prisma.groupStudent.count.mockResolvedValue(1);
      prisma.groupStudent.findMany.mockResolvedValue([
        {
          id: 'gs-1',
          studentId: 'student-1',
          subscriptionStartDate: startDate,
          student: {
            code: 'STU-001',
            user: {
              fullName: 'أحمد علي',
              email: 'ahmed@test.com',
              phone: '01012345678',
              avatar: null,
            },
          },
          payments: [
            {
              id: 'p-1',
              subscriptionDate: new Date('2026-10-01'),
              amount: 150,
              paidAt: new Date('2026-10-03'),
              notes: 'نقدي',
            },
          ],
        },
      ]);

      const result = await service.getGroupPayments(centerId, groupId, {
        page: 1,
        limit: 10,
        search: 'أحمد',
        month: '2026-10',
        skip: 0,
        take: 10,
      } as any);

      expect(prisma.groupStudent.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            groupId,
            centerId,
            student: expect.objectContaining({
              OR: expect.arrayContaining([
                expect.objectContaining({ code: { contains: 'أحمد', mode: 'insensitive' } }),
              ]),
            }),
            payments: expect.objectContaining({
              some: expect.objectContaining({
                subscriptionDate: expect.any(Object),
              }),
            }),
          }),
        }),
      );

      expect(result.data).toHaveLength(1);
      expect(result.data[0].studentInfo.fullName).toBe('أحمد علي');
      expect(result.data[0].paidMonths).toHaveLength(1);
      expect(result.data[0].unpaidMonths).toEqual(['2026-11-01', '2026-12-01']);
      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      });
    });
  });
});
