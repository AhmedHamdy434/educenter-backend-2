import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import { TeachersService } from './teachers.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { SubscriptionValidationService } from '../subscription-plans/subscription-validation.service';
import { ExcelService } from '../../shared/excel/excel.service';
import { PdfService } from '../../shared/pdf/pdf.service';
import { TeacherQueryDto } from './dto/get-teachers.dto';

describe('TeachersService - Excel & PDF, Import & Export, Sorting', () => {
  let service: TeachersService;
  let prisma: {
    teacher: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      delete: jest.Mock;
      count: jest.Mock;
      createManyAndReturn: jest.Mock;
    };
    subject: {
      findMany: jest.Mock;
    };
    user: {
      findMany: jest.Mock;
      delete: jest.Mock;
      createManyAndReturn: jest.Mock;
    };
    teacherSubject: {
      createMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let usersService: {
    createUserAccount: jest.Mock;
    updateUserAccount: jest.Mock;
  };
  let subscriptionValidationService: {
    getActiveSubscription: jest.Mock;
    validateTeacherLimit: jest.Mock;
  };
  let excelService: {
    buildWorkbookBuffer: jest.Mock;
    buildTemplateBuffer: jest.Mock;
    parseSheetRows: jest.Mock;
  };
  let pdfService: {
    buildTablePdfBuffer: jest.Mock;
  };

  const centerId = 'center-test-123';

  beforeEach(async () => {
    prisma = {
      teacher: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
        createManyAndReturn: jest.fn(),
      },
      subject: {
        findMany: jest.fn(),
      },
      user: {
        findMany: jest.fn(),
        delete: jest.fn(),
        createManyAndReturn: jest.fn(),
      },
      teacherSubject: {
        createMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    usersService = {
      createUserAccount: jest.fn(),
      updateUserAccount: jest.fn(),
    };

    subscriptionValidationService = {
      getActiveSubscription: jest.fn(),
      validateTeacherLimit: jest.fn(),
    };

    excelService = {
      buildWorkbookBuffer: jest.fn(),
      buildTemplateBuffer: jest.fn(),
      parseSheetRows: jest.fn(),
    };

    pdfService = {
      buildTablePdfBuffer: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeachersService,
        { provide: PrismaService, useValue: prisma },
        { provide: UsersService, useValue: usersService },
        {
          provide: SubscriptionValidationService,
          useValue: subscriptionValidationService,
        },
        { provide: ExcelService, useValue: excelService },
        { provide: PdfService, useValue: pdfService },
      ],
    }).compile();

    service = module.get<TeachersService>(TeachersService);
  });

  describe('findAll', () => {
    it('should sort by relation counts when sortBy is groups', async () => {
      prisma.teacher.count.mockResolvedValue(1);
      prisma.teacher.findMany.mockResolvedValue([]);

      const getOrderByMock = jest
        .fn()
        .mockReturnValue({ groups: { _count: 'asc' } });
      const query = {
        page: 1,
        limit: 10,
        sortBy: 'groups',
        sortOrder: 'asc',
        getOrderBy: getOrderByMock,
      } as unknown as TeacherQueryDto;

      await service.findAll(centerId, query);

      expect(getOrderByMock).toHaveBeenCalled();
      expect(prisma.teacher.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { groups: { _count: 'asc' } },
        }),
      );
    });

    it('should sort by relation counts when sortBy is subjects', async () => {
      prisma.teacher.count.mockResolvedValue(1);
      prisma.teacher.findMany.mockResolvedValue([]);

      const getOrderByMock = jest
        .fn()
        .mockReturnValue({ subjects: { _count: 'desc' } });
      const query = {
        page: 1,
        limit: 10,
        sortBy: 'subjects',
        sortOrder: 'desc',
        getOrderBy: getOrderByMock,
      } as unknown as TeacherQueryDto;

      await service.findAll(centerId, query);

      expect(getOrderByMock).toHaveBeenCalled();
      expect(prisma.teacher.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { subjects: { _count: 'desc' } },
        }),
      );
    });

    it('should sort by user fields when sortBy is fullName', async () => {
      prisma.teacher.count.mockResolvedValue(1);
      prisma.teacher.findMany.mockResolvedValue([]);

      const query = {
        page: 1,
        limit: 10,
        sortBy: 'fullName',
        sortOrder: 'asc',
      } as unknown as TeacherQueryDto;

      await service.findAll(centerId, query);

      expect(prisma.teacher.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { user: { fullName: 'asc' } },
        }),
      );
    });
  });

  describe('exportToExcel', () => {
    it('should query teachers scoped by centerId and generate Excel buffer', async () => {
      prisma.teacher.findMany.mockResolvedValue([
        {
          id: 'teacher-1',
          bio: 'مدرس خبير',
          createdAt: new Date('2026-09-01'),
          user: {
            fullName: 'أحمد محمود',
            email: 'ahmed@example.com',
            phone: '01012345678',
            isActive: true,
          },
          subjects: [
            {
              subject: {
                id: 'sub-1',
                name: 'رياضيات',
                grade: { name: 'الصف الأول الثانوي' },
              },
            },
          ],
          _count: {
            groups: 2,
            subjects: 1,
          },
        },
      ]);
      const mockBuffer = Buffer.from('mock-excel-teachers');
      excelService.buildWorkbookBuffer.mockResolvedValue(mockBuffer);

      const query = {
        getWhere: jest.fn().mockReturnValue({}),
        getOrderBy: jest.fn().mockReturnValue([{ createdAt: 'desc' }]),
      } as unknown as TeacherQueryDto;

      const result = await service.exportToExcel(centerId, query);

      expect(prisma.teacher.findMany).toHaveBeenCalled();
      expect(excelService.buildWorkbookBuffer).toHaveBeenCalledWith(
        expect.objectContaining({
          sheetName: 'المدرسين',
        }),
      );
      expect(result).toBe(mockBuffer);
    });

    it('should stream to res when response object is provided', async () => {
      prisma.teacher.findMany.mockResolvedValue([]);
      const mockBuffer = Buffer.from('mock-excel');
      excelService.buildWorkbookBuffer.mockResolvedValue(mockBuffer);

      const setHeaderMock = jest.fn();
      const sendMock = jest.fn();
      const mockRes = {
        setHeader: setHeaderMock,
        send: sendMock,
      } as unknown as Response;

      const query = {
        getWhere: jest.fn().mockReturnValue({}),
        getOrderBy: jest.fn().mockReturnValue([{ createdAt: 'desc' }]),
      } as unknown as TeacherQueryDto;

      await service.exportToExcel(centerId, query, mockRes);

      expect(setHeaderMock).toHaveBeenCalledWith(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(sendMock).toHaveBeenCalledWith(mockBuffer);
    });
  });

  describe('exportToPdf', () => {
    it('should generate RTL PDF buffer and stream to res', async () => {
      prisma.teacher.findMany.mockResolvedValue([
        {
          id: 'teacher-1',
          bio: 'مدرس خبير',
          createdAt: new Date('2026-09-01'),
          user: {
            fullName: 'أحمد محمود',
            email: 'ahmed@example.com',
            phone: '01012345678',
            isActive: true,
          },
          subjects: [],
          _count: {
            groups: 1,
            subjects: 0,
          },
        },
      ]);
      const mockBuffer = Buffer.from('mock-pdf-teachers');
      pdfService.buildTablePdfBuffer.mockResolvedValue(mockBuffer);

      const setHeaderMock = jest.fn();
      const sendMock = jest.fn();
      const mockRes = {
        setHeader: setHeaderMock,
        send: sendMock,
      } as unknown as Response;

      const query = {
        getWhere: jest.fn().mockReturnValue({}),
        getOrderBy: jest.fn().mockReturnValue([{ createdAt: 'desc' }]),
      } as unknown as TeacherQueryDto;

      await service.exportToPdf(centerId, query, mockRes);

      expect(pdfService.buildTablePdfBuffer).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'تقرير المدرسين',
          orientation: 'landscape',
        }),
      );
      expect(setHeaderMock).toHaveBeenCalledWith(
        'Content-Type',
        'application/pdf',
      );
      expect(sendMock).toHaveBeenCalledWith(mockBuffer);
    });
  });

  describe('getImportTemplate', () => {
    it('should query active subjects and return dual-sheet template buffer', async () => {
      prisma.subject.findMany.mockResolvedValue([
        { name: 'رياضيات', grade: { name: 'الصف الأول الثانوي' } },
        { name: 'فيزياء', grade: { name: 'الصف الثاني الثانوي' } },
      ]);
      const mockBuffer = Buffer.from('mock-teachers-template');
      excelService.buildTemplateBuffer.mockResolvedValue(mockBuffer);

      const result = await service.getImportTemplate(centerId);

      expect(prisma.subject.findMany).toHaveBeenCalledWith({
        where: { centerId, isActive: true },
        select: {
          id: true,
          name: true,
          grade: { select: { name: true } },
        },
        orderBy: { name: 'asc' },
      });
      expect(excelService.buildTemplateBuffer).toHaveBeenCalledWith(
        expect.objectContaining({
          dataSheetName: 'بيانات المدرسين',
          instructionsSheetName: 'دليل الاستيراد',
        }),
      );
      expect(result).toBe(mockBuffer);
    });
  });

  describe('importFromExcel', () => {
    const fileBuffer = Buffer.from('mock-file');

    beforeEach(() => {
      subscriptionValidationService.getActiveSubscription.mockResolvedValue({
        teacherLimit: 50,
      });
      prisma.teacher.count.mockResolvedValue(10);
      prisma.subject.findMany.mockResolvedValue([
        { id: 'sub-1', name: 'رياضيات' },
      ]);
      prisma.user.findMany.mockResolvedValue([]);
    });

    it('should throw BadRequestException if file has no data rows', async () => {
      excelService.parseSheetRows.mockResolvedValue({
        headers: ['اسم المدرس', 'البريد الإلكتروني'],
        rows: [],
      });

      await expect(
        service.importFromExcel(centerId, fileBuffer),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if import exceeds plan teacher limit', async () => {
      subscriptionValidationService.getActiveSubscription.mockResolvedValue({
        teacherLimit: 12,
      });
      prisma.teacher.count.mockResolvedValue(10);
      excelService.parseSheetRows.mockResolvedValue({
        headers: ['اسم المدرس', 'البريد الإلكتروني'],
        rows: Array(5).fill({
          rowNumber: 2,
          values: {
            'اسم المدرس': 'مدرس',
            'البريد الإلكتروني': 't@e.com',
          },
        }),
      });

      await expect(
        service.importFromExcel(centerId, fileBuffer),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw UnprocessableEntityException (422) if required fields are missing or invalid', async () => {
      excelService.parseSheetRows.mockResolvedValue({
        headers: ['اسم المدرس', 'البريد الإلكتروني'],
        rows: [
          {
            rowNumber: 2,
            values: {
              'اسم المدرس': 'م',
              'البريد الإلكتروني': 'invalid-email',
            },
          },
        ],
      });

      await expect(
        service.importFromExcel(centerId, fileBuffer),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('should throw UnprocessableEntityException (422) if email is duplicate within file', async () => {
      excelService.parseSheetRows.mockResolvedValue({
        headers: ['اسم المدرس', 'البريد الإلكتروني'],
        rows: [
          {
            rowNumber: 2,
            values: {
              'اسم المدرس': 'مدرس 1',
              'البريد الإلكتروني': 'teacher@example.com',
            },
          },
          {
            rowNumber: 3,
            values: {
              'اسم المدرس': 'مدرس 2',
              'البريد الإلكتروني': 'teacher@example.com',
            },
          },
        ],
      });

      await expect(
        service.importFromExcel(centerId, fileBuffer),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('should throw UnprocessableEntityException (422) if subject id is not registered in center or inactive', async () => {
      excelService.parseSheetRows.mockResolvedValue({
        headers: ['اسم المدرس', 'البريد الإلكتروني'],
        rows: [
          {
            rowNumber: 2,
            values: {
              'اسم المدرس': 'مدرس 1',
              'البريد الإلكتروني': 'teacher1@example.com',
              'معرفات المواد (Subject IDs مفصولة بفاصلة)':
                'non-existent-sub-id',
            },
          },
        ],
      });

      await expect(
        service.importFromExcel(centerId, fileBuffer),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('should support dryRun=true and return validated rows preview without DB writes', async () => {
      excelService.parseSheetRows.mockResolvedValue({
        headers: ['اسم المدرس', 'البريد الإلكتروني'],
        rows: [
          {
            rowNumber: 2,
            values: {
              'اسم المدرس': 'محمد أحمد',
              'البريد الإلكتروني': 'teacher@example.com',
            },
          },
        ],
      });

      const result = await service.importFromExcel(centerId, fileBuffer, true);

      expect(result.totalRows).toBe(1);
      expect(result.validRows).toBe(1);
      expect(result.failedRows).toBe(0);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should execute batch insertion in prisma.$transaction with single password hash when dryRun=false', async () => {
      excelService.parseSheetRows.mockResolvedValue({
        headers: [
          'اسم المدرس',
          'البريد الإلكتروني',
          'رقم الهاتف',
          'معرفات المواد (Subject IDs مفصولة بفاصلة)',
          'نبذة تعريفية',
        ],
        rows: [
          {
            rowNumber: 2,
            values: {
              'اسم المدرس': 'محمد أحمد',
              'البريد الإلكتروني': 'teacher@example.com',
              'رقم الهاتف': '01012345678',
              'معرفات المواد (Subject IDs مفصولة بفاصلة)': 'sub-1',
              'نبذة تعريفية': 'مدرس أول',
            },
          },
        ],
      });

      const mockTx = {
        user: {
          createManyAndReturn: jest
            .fn()
            .mockResolvedValue([
              { id: 'user-1', email: 'teacher@example.com' },
            ]),
        },
        teacher: {
          createManyAndReturn: jest
            .fn()
            .mockResolvedValue([{ id: 'teacher-1', userId: 'user-1' }]),
        },
        teacherSubject: {
          createMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };

      prisma.$transaction.mockImplementation(
        async (cb: (tx: typeof mockTx) => Promise<unknown>) => {
          return await cb(mockTx);
        },
      );

      const result = await service.importFromExcel(centerId, fileBuffer, false);

      expect(result.totalRows).toBe(1);
      expect(result.validRows).toBe(1);
      expect(result.initialDefaultPassword).toBeDefined();
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(mockTx.user.createManyAndReturn).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            fullName: 'محمد أحمد',
            email: 'teacher@example.com',
            centerId,
            role: 'TEACHER',
          }),
        ],
        select: { id: true, email: true },
      });
      expect(mockTx.teacher.createManyAndReturn).toHaveBeenCalled();
      expect(mockTx.teacherSubject.createMany).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should throw NotFoundException if teacher does not exist', async () => {
      prisma.teacher.findFirst.mockResolvedValue(null);

      await expect(service.remove(centerId, 'teacher-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if teacher is linked to groups', async () => {
      prisma.teacher.findFirst.mockResolvedValue({
        id: 'teacher-1',
        user: { id: 'user-1' },
        _count: { groups: 2, subjects: 0 },
      });

      await expect(service.remove(centerId, 'teacher-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if teacher is linked to subjects', async () => {
      prisma.teacher.findFirst.mockResolvedValue({
        id: 'teacher-1',
        user: { id: 'user-1' },
        _count: { groups: 0, subjects: 1 },
      });

      await expect(service.remove(centerId, 'teacher-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should successfully delete teacher and associated user in transaction when no relations', async () => {
      prisma.teacher.findFirst.mockResolvedValue({
        id: 'teacher-1',
        user: { id: 'user-1' },
        _count: { groups: 0, subjects: 0 },
      });

      const mockTx = {
        teacher: { delete: jest.fn().mockResolvedValue({ id: 'teacher-1' }) },
        user: { delete: jest.fn().mockResolvedValue({ id: 'user-1' }) },
      };
      prisma.$transaction.mockImplementation(
        async (cb: (tx: typeof mockTx) => Promise<unknown>) => {
          return await cb(mockTx);
        },
      );

      await service.remove(centerId, 'teacher-1');

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(mockTx.teacher.delete).toHaveBeenCalledWith({
        where: { id: 'teacher-1' },
      });
      expect(mockTx.user.delete).toHaveBeenCalledWith({
        where: { id: 'user-1' },
      });
    });
  });
});
