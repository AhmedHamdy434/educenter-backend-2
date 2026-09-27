import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import { Prisma } from '@prisma/client';
import { SubjectsService } from './subjects.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { ExcelService } from '../../shared/excel/excel.service';
import { PdfService } from '../../shared/pdf/pdf.service';
import { SubscriptionValidationService } from '../subscription-plans/subscription-validation.service';
import { SubjectQueryDto } from './dto/get-subjects.dto';

describe('SubjectsService - Excel & PDF Import/Export', () => {
  let service: SubjectsService;
  let prisma: {
    subject: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      createMany: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      count: jest.Mock;
    };
    grade: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let excelService: {
    buildWorkbookBuffer: jest.Mock;
    buildTemplateBuffer: jest.Mock;
    parseSheetRows: jest.Mock;
  };
  let pdfService: {
    buildTablePdfBuffer: jest.Mock;
  };
  let subscriptionValidationService: {
    validateSubjectLimit: jest.Mock;
    getActiveSubscription: jest.Mock;
  };

  const centerId = 'center-123';

  beforeEach(async () => {
    prisma = {
      subject: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        createMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      grade: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    excelService = {
      buildWorkbookBuffer: jest.fn(),
      buildTemplateBuffer: jest.fn(),
      parseSheetRows: jest.fn(),
    };

    pdfService = {
      buildTablePdfBuffer: jest.fn(),
    };

    subscriptionValidationService = {
      validateSubjectLimit: jest.fn(),
      getActiveSubscription: jest.fn().mockResolvedValue({
        subjectLimit: 100,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubjectsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ExcelService, useValue: excelService },
        { provide: PdfService, useValue: pdfService },
        {
          provide: SubscriptionValidationService,
          useValue: subscriptionValidationService,
        },
      ],
    }).compile();

    service = module.get<SubjectsService>(SubjectsService);
  });

  describe('findAll', () => {
    it('should query subjects scoped by centerId and return paginated data with meta', async () => {
      prisma.subject.count.mockResolvedValue(1);
      prisma.subject.findMany.mockResolvedValue([
        {
          id: 'subject-1',
          name: 'اللغة العربية',
          description: 'منهج الثانوية',
          isActive: true,
          gradeId: 'grade-1',
          grade: { id: 'grade-1', name: 'الصف الأول الثانوي' },
          createdAt: new Date('2026-09-01'),
          _count: { teacherSubjects: 2, groups: 3 },
        },
      ]);

      const query = new SubjectQueryDto();
      const result = await service.findAll(centerId, query);

      expect(prisma.subject.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ centerId }),
        }),
      );
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });

  describe('exportToExcel', () => {
    it('should query subjects scoped by centerId and generate Excel buffer', async () => {
      prisma.subject.findMany.mockResolvedValue([
        {
          id: 'subject-1',
          name: 'اللغة العربية',
          description: 'منهج الثانوية',
          isActive: true,
          gradeId: 'grade-1',
          grade: { id: 'grade-1', name: 'الصف الأول الثانوي' },
          createdAt: new Date('2026-09-01'),
          _count: { teacherSubjects: 2, groups: 3 },
        },
      ]);
      const mockBuffer = Buffer.from('mock-excel-data');
      excelService.buildWorkbookBuffer.mockResolvedValue(mockBuffer);

      const query = {
        getWhere: jest.fn().mockReturnValue({}),
        getOrderBy: jest.fn().mockReturnValue([{ createdAt: 'desc' }]),
      } as unknown as SubjectQueryDto;

      const result = await service.exportToExcel(centerId, query);

      expect(prisma.subject.findMany).toHaveBeenCalled();
      expect(excelService.buildWorkbookBuffer).toHaveBeenCalledWith(
        expect.objectContaining({
          sheetName: 'المواد الدراسية',
        }),
      );
      expect(result).toBe(mockBuffer);
    });

    it('should stream to res if response object is provided', async () => {
      prisma.subject.findMany.mockResolvedValue([]);
      const mockBuffer = Buffer.from('mock-excel-data');
      excelService.buildWorkbookBuffer.mockResolvedValue(mockBuffer);

      const query = {
        getWhere: jest.fn().mockReturnValue({}),
        getOrderBy: jest.fn().mockReturnValue([]),
      } as unknown as SubjectQueryDto;

      const setHeader = jest.fn();
      const send = jest.fn();
      const res = { setHeader, send } as unknown as Response;

      await service.exportToExcel(centerId, query, res);

      expect(setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(send).toHaveBeenCalledWith(mockBuffer);
    });
  });

  describe('exportToPdf', () => {
    it('should query subjects scoped by centerId and generate PDF buffer', async () => {
      prisma.subject.findMany.mockResolvedValue([
        {
          id: 'subject-1',
          name: 'اللغة العربية',
          description: 'منهج الثانوية',
          isActive: true,
          gradeId: 'grade-1',
          grade: { id: 'grade-1', name: 'الصف الأول الثانوي' },
          createdAt: new Date('2026-09-01'),
          _count: { teacherSubjects: 2, groups: 3 },
        },
      ]);
      const mockBuffer = Buffer.from('mock-pdf-data');
      pdfService.buildTablePdfBuffer.mockResolvedValue(mockBuffer);

      const query = {
        getWhere: jest.fn().mockReturnValue({}),
        getOrderBy: jest.fn().mockReturnValue([{ createdAt: 'desc' }]),
      } as unknown as SubjectQueryDto;

      const result = await service.exportToPdf(centerId, query);

      expect(prisma.subject.findMany).toHaveBeenCalled();
      expect(pdfService.buildTablePdfBuffer).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'تقرير المواد الدراسية',
        }),
      );
      expect(result).toBe(mockBuffer);
    });

    it('should stream to res if response object is provided', async () => {
      prisma.subject.findMany.mockResolvedValue([]);
      const mockBuffer = Buffer.from('mock-pdf-data');
      pdfService.buildTablePdfBuffer.mockResolvedValue(mockBuffer);

      const query = {
        getWhere: jest.fn().mockReturnValue({}),
        getOrderBy: jest.fn().mockReturnValue([]),
      } as unknown as SubjectQueryDto;

      const setHeader = jest.fn();
      const send = jest.fn();
      const res = { setHeader, send } as unknown as Response;

      await service.exportToPdf(centerId, query, res);

      expect(setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(send).toHaveBeenCalledWith(mockBuffer);
    });
  });

  describe('getImportTemplate', () => {
    it('should call excelService.buildTemplateBuffer and return template buffer', async () => {
      prisma.grade.findMany.mockResolvedValue([
        { id: 'grade-1', name: 'الصف الأول الثانوي' },
      ]);
      const mockBuffer = Buffer.from('template-buffer');
      excelService.buildTemplateBuffer.mockResolvedValue(mockBuffer);

      const result = await service.getImportTemplate(centerId);

      expect(prisma.grade.findMany).toHaveBeenCalled();
      expect(excelService.buildTemplateBuffer).toHaveBeenCalledWith(
        expect.objectContaining({
          dataSheetName: 'المواد الدراسية',
          instructionsSheetName: 'دليل الاستيراد',
        }),
      );
      expect(result).toBe(mockBuffer);
    });

    it('should stream template to res if response object is provided', async () => {
      prisma.grade.findMany.mockResolvedValue([]);
      const mockBuffer = Buffer.from('template-buffer');
      excelService.buildTemplateBuffer.mockResolvedValue(mockBuffer);

      const setHeader = jest.fn();
      const send = jest.fn();
      const res = { setHeader, send } as unknown as Response;

      await service.getImportTemplate(centerId, res);

      expect(setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(send).toHaveBeenCalledWith(mockBuffer);
    });
  });

  describe('importFromExcel', () => {
    const mockFileBuffer = Buffer.from('excel-binary');

    it('should throw BadRequestException if sheet has no data rows', async () => {
      excelService.parseSheetRows.mockResolvedValue({ rows: [] });

      await expect(
        service.importFromExcel(centerId, mockFileBuffer),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw UnprocessableEntityException (422) if required name is empty', async () => {
      excelService.parseSheetRows.mockResolvedValue({
        rows: [
          {
            rowNumber: 2,
            values: {
              'اسم المادة الدراسية': '',
              'معرف المرحلة (Grade ID)': 'grade-1',
            },
          },
        ],
      });
      prisma.grade.findMany.mockResolvedValue([
        { id: 'grade-1', name: 'الصف الأول الثانوي', isActive: true },
      ]);
      prisma.subject.findMany.mockResolvedValue([]);

      try {
        await service.importFromExcel(centerId, mockFileBuffer);
        fail('Should have thrown UnprocessableEntityException');
      } catch (err) {
        expect(err).toBeInstanceOf(UnprocessableEntityException);
        const response = (
          err as UnprocessableEntityException
        ).getResponse() as {
          statusCode: number;
          data: { failedRows: number; errors: Array<{ field: string }> };
        };
        expect(response.statusCode).toBe(422);
        expect(response.data.failedRows).toBe(1);
        expect(response.data.errors[0].field).toBe('name');
      }
    });

    it('should throw UnprocessableEntityException (422) if required gradeId is empty', async () => {
      excelService.parseSheetRows.mockResolvedValue({
        rows: [
          {
            rowNumber: 2,
            values: {
              'اسم المادة الدراسية': 'اللغة العربية',
              'معرف المرحلة (Grade ID)': '',
            },
          },
        ],
      });
      prisma.grade.findMany.mockResolvedValue([]);
      prisma.subject.findMany.mockResolvedValue([]);

      try {
        await service.importFromExcel(centerId, mockFileBuffer);
        fail('Should have thrown UnprocessableEntityException');
      } catch (err) {
        expect(err).toBeInstanceOf(UnprocessableEntityException);
        const response = (
          err as UnprocessableEntityException
        ).getResponse() as {
          statusCode: number;
          data: { failedRows: number; errors: Array<{ field: string }> };
        };
        expect(response.statusCode).toBe(422);
        expect(response.data.failedRows).toBe(1);
        expect(response.data.errors[0].field).toBe('gradeId');
      }
    });

    it('should throw UnprocessableEntityException (422) if gradeId does not exist in center or is inactive', async () => {
      excelService.parseSheetRows.mockResolvedValue({
        rows: [
          {
            rowNumber: 2,
            values: {
              'اسم المادة الدراسية': 'اللغة العربية',
              'معرف المرحلة (Grade ID)': 'grade-non-existent',
            },
          },
        ],
      });
      prisma.grade.findMany.mockResolvedValue([
        { id: 'grade-1', name: 'الصف الأول الثانوي', isActive: true },
      ]);
      prisma.subject.findMany.mockResolvedValue([]);

      try {
        await service.importFromExcel(centerId, mockFileBuffer);
        fail('Should have thrown UnprocessableEntityException');
      } catch (err) {
        expect(err).toBeInstanceOf(UnprocessableEntityException);
        const response = (
          err as UnprocessableEntityException
        ).getResponse() as {
          statusCode: number;
          data: { errors: Array<{ message: string }> };
        };
        expect(response.data.errors[0].message).toContain('غير صالح');
      }
    });

    it('should throw UnprocessableEntityException (422) if duplicate subject for same grade exists in same file', async () => {
      excelService.parseSheetRows.mockResolvedValue({
        rows: [
          {
            rowNumber: 2,
            values: {
              'اسم المادة الدراسية': 'اللغة العربية',
              'معرف المرحلة (Grade ID)': 'grade-1',
            },
          },
          {
            rowNumber: 3,
            values: {
              'اسم المادة الدراسية': 'اللغة العربية',
              'معرف المرحلة (Grade ID)': 'grade-1',
            },
          },
        ],
      });
      prisma.grade.findMany.mockResolvedValue([
        { id: 'grade-1', name: 'الصف الأول الثانوي', isActive: true },
      ]);
      prisma.subject.findMany.mockResolvedValue([]);

      try {
        await service.importFromExcel(centerId, mockFileBuffer);
        fail('Should have thrown UnprocessableEntityException');
      } catch (err) {
        expect(err).toBeInstanceOf(UnprocessableEntityException);
        const response = (
          err as UnprocessableEntityException
        ).getResponse() as {
          statusCode: number;
          data: { failedRows: number; errors: Array<{ message: string }> };
        };
        expect(response.data.failedRows).toBe(1);
        expect(response.data.errors[0].message).toContain('مكررة لنفس المرحلة');
      }
    });

    it('should throw UnprocessableEntityException (422) if subject already exists for same grade in DB', async () => {
      excelService.parseSheetRows.mockResolvedValue({
        rows: [
          {
            rowNumber: 2,
            values: {
              'اسم المادة الدراسية': 'اللغة العربية',
              'معرف المرحلة (Grade ID)': 'grade-1',
            },
          },
        ],
      });
      prisma.grade.findMany.mockResolvedValue([
        { id: 'grade-1', name: 'الصف الأول الثانوي', isActive: true },
      ]);
      prisma.subject.findMany.mockResolvedValue([
        { name: 'اللغة العربية', gradeId: 'grade-1' },
      ]);

      try {
        await service.importFromExcel(centerId, mockFileBuffer);
        fail('Should have thrown UnprocessableEntityException');
      } catch (err) {
        expect(err).toBeInstanceOf(UnprocessableEntityException);
        const response = (
          err as UnprocessableEntityException
        ).getResponse() as {
          statusCode: number;
          data: { failedRows: number; errors: Array<{ message: string }> };
        };
        expect(response.data.failedRows).toBe(1);
        expect(response.data.errors[0].message).toContain('مسجلة بالفعل');
      }
    });

    it('should throw BadRequestException if importing rows exceeds subjectLimit', async () => {
      excelService.parseSheetRows.mockResolvedValue({
        rows: [
          {
            rowNumber: 2,
            values: {
              'اسم المادة الدراسية': 'اللغة العربية',
              'معرف المرحلة (Grade ID)': 'grade-1',
            },
          },
        ],
      });
      prisma.grade.findMany.mockResolvedValue([
        { id: 'grade-1', name: 'الصف الأول الثانوي', isActive: true },
      ]);
      prisma.subject.findMany.mockResolvedValue([]);
      subscriptionValidationService.getActiveSubscription.mockResolvedValue({
        subjectLimit: 5,
      });
      prisma.subject.count.mockResolvedValue(5);

      await expect(
        service.importFromExcel(centerId, mockFileBuffer),
      ).rejects.toThrow(BadRequestException);
    });

    it('should support dryRun=true and return validated rows without committing to DB', async () => {
      excelService.parseSheetRows.mockResolvedValue({
        rows: [
          {
            rowNumber: 2,
            values: {
              'اسم المادة الدراسية': 'اللغة العربية',
              'معرف المرحلة (Grade ID)': 'grade-1',
              'المرحلة الدراسية (للتوضيح)': 'الصف الأول الثانوي',
              الوصف: 'وصف اختياري',
            },
          },
        ],
      });
      prisma.grade.findMany.mockResolvedValue([
        { id: 'grade-1', name: 'الصف الأول الثانوي', isActive: true },
      ]);
      prisma.subject.findMany.mockResolvedValue([]);
      prisma.subject.count.mockResolvedValue(0);

      const result = await service.importFromExcel(
        centerId,
        mockFileBuffer,
        true,
      );

      expect(result.validRows).toBe(1);
      expect(result.failedRows).toBe(0);
      expect(result.data).toHaveLength(1);
      expect(result.data![0].name).toBe('اللغة العربية');
      expect(result.data![0].gradeId).toBe('grade-1');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should insert subjects within prisma.$transaction when dryRun=false', async () => {
      excelService.parseSheetRows.mockResolvedValue({
        rows: [
          {
            rowNumber: 2,
            values: {
              'اسم المادة الدراسية': 'اللغة العربية',
              'معرف المرحلة (Grade ID)': 'grade-1',
              'المرحلة الدراسية (للتوضيح)': 'الصف الأول الثانوي',
            },
          },
        ],
      });
      prisma.grade.findMany.mockResolvedValue([
        { id: 'grade-1', name: 'الصف الأول الثانوي', isActive: true },
      ]);
      prisma.subject.findMany.mockResolvedValue([]);
      prisma.subject.count.mockResolvedValue(0);

      const mockTx = {
        subject: {
          createMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      prisma.$transaction.mockImplementation(async (cb) => cb(mockTx));

      const result = await service.importFromExcel(
        centerId,
        mockFileBuffer,
        false,
      );

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(mockTx.subject.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            name: 'اللغة العربية',
            gradeId: 'grade-1',
            centerId,
          }),
        ],
      });
      expect(result.validRows).toBe(1);
      expect(result.failedRows).toBe(0);
    });

    it('should translate P2002 error into UnprocessableEntityException', async () => {
      excelService.parseSheetRows.mockResolvedValue({
        rows: [
          {
            rowNumber: 2,
            values: {
              'اسم المادة الدراسية': 'اللغة العربية',
              'معرف المرحلة (Grade ID)': 'grade-1',
            },
          },
        ],
      });
      prisma.grade.findMany.mockResolvedValue([
        { id: 'grade-1', name: 'الصف الأول الثانوي', isActive: true },
      ]);
      prisma.subject.findMany.mockResolvedValue([]);
      prisma.subject.count.mockResolvedValue(0);

      const p2002Error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint violation',
        { code: 'P2002', clientVersion: '5.0.0' },
      );
      prisma.$transaction.mockRejectedValue(p2002Error);

      await expect(
        service.importFromExcel(centerId, mockFileBuffer, false),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('remove', () => {
    it('should throw NotFoundException if subject does not exist', async () => {
      prisma.subject.findFirst.mockResolvedValue(null);

      await expect(service.remove(centerId, 'subject-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if subject is linked to groups', async () => {
      prisma.subject.findFirst.mockResolvedValue({
        id: 'subject-1',
        _count: { groups: 1, teacherSubjects: 0 },
      });

      await expect(service.remove(centerId, 'subject-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if subject is linked to teacherSubjects', async () => {
      prisma.subject.findFirst.mockResolvedValue({
        id: 'subject-1',
        _count: { groups: 0, teacherSubjects: 2 },
      });

      await expect(service.remove(centerId, 'subject-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should successfully delete subject if not linked to any groups or teachers', async () => {
      prisma.subject.findFirst.mockResolvedValue({
        id: 'subject-1',
        _count: { groups: 0, teacherSubjects: 0 },
      });
      prisma.subject.delete.mockResolvedValue({ id: 'subject-1' });

      await service.remove(centerId, 'subject-1');

      expect(prisma.subject.delete).toHaveBeenCalledWith({
        where: { id: 'subject-1' },
      });
    });
  });
});
