import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import { StudentsService } from './students.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { SubscriptionValidationService } from '../subscription-plans/subscription-validation.service';
import { ExcelService } from '../../shared/excel/excel.service';
import { PdfService } from '../../shared/pdf/pdf.service';
import { StudentQueryDto } from './dto/get-students.dto';

describe('StudentsService - Excel & PDF, Import & Export, Sorting', () => {
  let service: StudentsService;
  let prisma: {
    student: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      delete: jest.Mock;
      count: jest.Mock;
      createManyAndReturn: jest.Mock;
    };
    grade: {
      findMany: jest.Mock;
    };
    user: {
      findMany: jest.Mock;
      delete: jest.Mock;
      createManyAndReturn: jest.Mock;
    };
    studentEnrollment: {
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
    validateStudentLimit: jest.Mock;
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
      student: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
        createManyAndReturn: jest.fn(),
      },
      grade: {
        findMany: jest.fn(),
      },
      user: {
        findMany: jest.fn(),
        delete: jest.fn(),
        createManyAndReturn: jest.fn(),
      },
      studentEnrollment: {
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
      validateStudentLimit: jest.fn(),
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
        StudentsService,
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

    service = module.get<StudentsService>(StudentsService);
  });

  describe('findAll', () => {
    it('should sort by relation counts when sortBy is groups', async () => {
      prisma.student.count.mockResolvedValue(1);
      prisma.student.findMany.mockResolvedValue([]);

      const getOrderByMock = jest
        .fn()
        .mockReturnValue({ groups: { _count: 'asc' } });
      const query = {
        page: 1,
        limit: 10,
        sortBy: 'groups',
        sortOrder: 'asc',
        getOrderBy: getOrderByMock,
      } as unknown as StudentQueryDto;

      await service.findAll(centerId, query);

      expect(getOrderByMock).toHaveBeenCalled();
      expect(prisma.student.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { groups: { _count: 'asc' } },
        }),
      );
    });

    it('should sort by user fields when sortBy is fullName', async () => {
      prisma.student.count.mockResolvedValue(1);
      prisma.student.findMany.mockResolvedValue([]);

      const query = {
        page: 1,
        limit: 10,
        sortBy: 'fullName',
        sortOrder: 'asc',
      } as unknown as StudentQueryDto;

      await service.findAll(centerId, query);

      expect(prisma.student.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { user: { fullName: 'asc' } },
        }),
      );
    });
  });

  describe('exportToExcel', () => {
    it('should query students scoped by centerId and generate Excel buffer', async () => {
      prisma.student.findMany.mockResolvedValue([
        {
          id: 'student-1',
          parentPhone: '01198765432',
          notes: 'طالب ممتاز',
          createdAt: new Date('2026-09-01'),
          user: {
            fullName: 'أحمد محمود',
            email: 'ahmed@example.com',
            phone: '01012345678',
            isActive: true,
          },
          enrollments: [
            {
              grade: { name: 'الصف الأول الثانوي' },
            },
          ],
          _count: {
            groups: 2,
            attendance: 5,
          },
        },
      ]);
      const mockBuffer = Buffer.from('mock-excel-students');
      excelService.buildWorkbookBuffer.mockResolvedValue(mockBuffer);

      const query = {
        getWhere: jest.fn().mockReturnValue({}),
        getOrderBy: jest.fn().mockReturnValue([{ createdAt: 'desc' }]),
      } as unknown as StudentQueryDto;

      const result = await service.exportToExcel(centerId, query);

      expect(prisma.student.findMany).toHaveBeenCalled();
      expect(excelService.buildWorkbookBuffer).toHaveBeenCalledWith(
        expect.objectContaining({
          sheetName: 'الطلاب',
        }),
      );
      expect(result).toBe(mockBuffer);
    });

    it('should stream to res when response object is provided', async () => {
      prisma.student.findMany.mockResolvedValue([]);
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
      } as unknown as StudentQueryDto;

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
      prisma.student.findMany.mockResolvedValue([
        {
          id: 'student-1',
          parentPhone: '01198765432',
          notes: 'طالب ممتاز',
          createdAt: new Date('2026-09-01'),
          user: {
            fullName: 'أحمد محمود',
            email: 'ahmed@example.com',
            phone: '01012345678',
            isActive: true,
          },
          enrollments: [
            {
              grade: { name: 'الصف الأول الثانوي' },
            },
          ],
          _count: {
            groups: 1,
            attendance: 3,
          },
        },
      ]);
      const mockBuffer = Buffer.from('mock-pdf-students');
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
      } as unknown as StudentQueryDto;

      await service.exportToPdf(centerId, query, mockRes);

      expect(pdfService.buildTablePdfBuffer).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'تقرير الطلاب',
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
    it('should query active grades and return dual-sheet template buffer', async () => {
      prisma.grade.findMany.mockResolvedValue([
        { name: 'الصف الأول الثانوي' },
        { name: 'الصف الثاني الثانوي' },
      ]);
      const mockBuffer = Buffer.from('mock-students-template');
      excelService.buildTemplateBuffer.mockResolvedValue(mockBuffer);

      const result = await service.getImportTemplate(centerId);

      expect(prisma.grade.findMany).toHaveBeenCalledWith({
        where: { centerId, isActive: true },
        select: { id: true, name: true },
        orderBy: { order: 'asc' },
      });
      expect(excelService.buildTemplateBuffer).toHaveBeenCalledWith(
        expect.objectContaining({
          dataSheetName: 'بيانات الطلاب',
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
        studentLimit: 500,
      });
      prisma.student.count.mockResolvedValue(100);
      prisma.grade.findMany.mockResolvedValue([
        { id: 'grade-1', name: 'الصف الأول الثانوي' },
      ]);
      prisma.user.findMany.mockResolvedValue([]);
    });

    it('should throw BadRequestException if file has no data rows', async () => {
      excelService.parseSheetRows.mockResolvedValue({
        headers: ['اسم الطالب', 'البريد الإلكتروني', 'المرحلة الدراسية'],
        rows: [],
      });

      await expect(
        service.importFromExcel(centerId, fileBuffer),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if import exceeds plan student limit', async () => {
      subscriptionValidationService.getActiveSubscription.mockResolvedValue({
        studentLimit: 105,
      });
      prisma.student.count.mockResolvedValue(100);
      excelService.parseSheetRows.mockResolvedValue({
        headers: ['اسم الطالب', 'البريد الإلكتروني', 'المرحلة الدراسية'],
        rows: Array(10).fill({
          rowNumber: 2,
          values: {
            'اسم الطالب': 'طالب',
            'البريد الإلكتروني': 't@e.com',
            'معرف المرحلة (Grade ID)': 'grade-1',
          },
        }),
      });

      await expect(
        service.importFromExcel(centerId, fileBuffer),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw UnprocessableEntityException (422) if required fields are missing or invalid', async () => {
      excelService.parseSheetRows.mockResolvedValue({
        headers: ['اسم الطالب', 'البريد الإلكتروني', 'المرحلة الدراسية'],
        rows: [
          {
            rowNumber: 2,
            values: {
              'اسم الطالب': 'أ',
              'البريد الإلكتروني': 'invalid-email',
              'معرف المرحلة (Grade ID)': '',
            },
          },
        ],
      });

      await expect(
        service.importFromExcel(centerId, fileBuffer),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('should throw UnprocessableEntityException (422) if email is duplicate within the file', async () => {
      excelService.parseSheetRows.mockResolvedValue({
        headers: ['اسم الطالب', 'البريد الإلكتروني', 'المرحلة الدراسية'],
        rows: [
          {
            rowNumber: 2,
            values: {
              'اسم الطالب': 'طالب 1',
              'البريد الإلكتروني': 'student@example.com',
              'معرف المرحلة (Grade ID)': 'grade-1',
            },
          },
          {
            rowNumber: 3,
            values: {
              'اسم الطالب': 'طالب 2',
              'البريد الإلكتروني': 'student@example.com',
              'معرف المرحلة (Grade ID)': 'grade-1',
            },
          },
        ],
      });

      await expect(
        service.importFromExcel(centerId, fileBuffer),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('should throw UnprocessableEntityException (422) if grade does not exist in center or is inactive', async () => {
      excelService.parseSheetRows.mockResolvedValue({
        headers: ['اسم الطالب', 'البريد الإلكتروني'],
        rows: [
          {
            rowNumber: 2,
            values: {
              'اسم الطالب': 'طالب 1',
              'البريد الإلكتروني': 'student1@example.com',
              'معرف المرحلة (Grade ID)': 'non-existent-grade-id',
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
        headers: ['اسم الطالب', 'البريد الإلكتروني', 'المرحلة الدراسية'],
        rows: [
          {
            rowNumber: 2,
            values: {
              'اسم الطالب': 'أحمد محمود',
              'البريد الإلكتروني': 'ahmed@example.com',
              'معرف المرحلة (Grade ID)': 'grade-1',
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
          'اسم الطالب',
          'البريد الإلكتروني',
          'رقم هاتف الطالب',
          'معرف المرحلة (Grade ID)',
        ],
        rows: [
          {
            rowNumber: 2,
            values: {
              'اسم الطالب': 'أحمد محمود',
              'البريد الإلكتروني': 'ahmed@example.com',
              'رقم هاتف الطالب': '01012345678',
              'معرف المرحلة (Grade ID)': 'grade-1',
            },
          },
        ],
      });

      const mockTx = {
        user: {
          createManyAndReturn: jest
            .fn()
            .mockResolvedValue([{ id: 'user-1', email: 'ahmed@example.com' }]),
        },
        student: {
          createManyAndReturn: jest
            .fn()
            .mockResolvedValue([{ id: 'student-1', userId: 'user-1' }]),
        },
        studentEnrollment: {
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
            fullName: 'أحمد محمود',
            email: 'ahmed@example.com',
            centerId,
            role: 'STUDENT',
          }),
        ],
        select: { id: true, email: true },
      });
      expect(mockTx.student.createManyAndReturn).toHaveBeenCalled();
      expect(mockTx.studentEnrollment.createMany).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should throw NotFoundException if student does not exist', async () => {
      prisma.student.findFirst.mockResolvedValue(null);

      await expect(service.remove(centerId, 'student-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if student is linked to groups', async () => {
      prisma.student.findFirst.mockResolvedValue({
        id: 'student-1',
        user: { id: 'user-1' },
        _count: { groups: 1, attendance: 0 },
      });

      await expect(service.remove(centerId, 'student-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if student has attendance records', async () => {
      prisma.student.findFirst.mockResolvedValue({
        id: 'student-1',
        user: { id: 'user-1' },
        _count: { groups: 0, attendance: 3 },
      });

      await expect(service.remove(centerId, 'student-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should successfully delete student and associated user in transaction when no relations', async () => {
      prisma.student.findFirst.mockResolvedValue({
        id: 'student-1',
        user: { id: 'user-1' },
        _count: { groups: 0, attendance: 0 },
      });

      const mockTx = {
        student: { delete: jest.fn().mockResolvedValue({ id: 'student-1' }) },
        user: { delete: jest.fn().mockResolvedValue({ id: 'user-1' }) },
      };
      prisma.$transaction.mockImplementation(
        async (cb: (tx: typeof mockTx) => Promise<unknown>) => {
          return await cb(mockTx);
        },
      );

      await service.remove(centerId, 'student-1');

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(mockTx.student.delete).toHaveBeenCalledWith({
        where: { id: 'student-1' },
      });
      expect(mockTx.user.delete).toHaveBeenCalledWith({
        where: { id: 'user-1' },
      });
    });
  });
});
