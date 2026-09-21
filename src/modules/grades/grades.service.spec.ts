import {
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { GradesService } from './grades.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { ExcelService } from '../../shared/excel/excel.service';
import { GradeQueryDto } from './dto/get-grades.dto';

describe('GradesService - Excel Import & Export', () => {
  let service: GradesService;
  let prisma: {
    grade: {
      findMany: jest.Mock;
      createMany: jest.Mock;
      findUnique: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let excelService: {
    buildWorkbookBuffer: jest.Mock;
    buildTemplateBuffer: jest.Mock;
    parseSheetRows: jest.Mock;
  };

  const centerId = 'center-123';

  beforeEach(async () => {
    prisma = {
      grade: {
        findMany: jest.fn(),
        createMany: jest.fn(),
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    excelService = {
      buildWorkbookBuffer: jest.fn(),
      buildTemplateBuffer: jest.fn(),
      parseSheetRows: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GradesService,
        { provide: PrismaService, useValue: prisma },
        { provide: ExcelService, useValue: excelService },
      ],
    }).compile();

    service = module.get<GradesService>(GradesService);
  });

  describe('exportToExcel', () => {
    it('should query grades scoped by centerId and generate Excel buffer', async () => {
      prisma.grade.findMany.mockResolvedValue([
        {
          id: 'grade-1',
          name: 'الصف الأول الثانوي',
          order: 1,
          description: 'مرحلة عامة',
          isActive: true,
          createdAt: new Date('2026-09-01'),
          _count: { subjects: 5, groups: 2, enrollments: 30 },
        },
      ]);
      const mockBuffer = Buffer.from('mock-excel-data');
      excelService.buildWorkbookBuffer.mockResolvedValue(mockBuffer);

      const query = {
        getWhere: jest.fn().mockReturnValue({}),
        getOrderBy: jest.fn().mockReturnValue([{ order: 'asc' }]),
      } as unknown as GradeQueryDto;

      const result = await service.exportToExcel(centerId, query);

      expect(prisma.grade.findMany).toHaveBeenCalled();
      expect(excelService.buildWorkbookBuffer).toHaveBeenCalledWith(
        expect.objectContaining({
          sheetName: 'المراحل الدراسية',
        }),
      );
      expect(result).toBe(mockBuffer);
    });
  });

  describe('getImportTemplate', () => {
    it('should call excelService.buildTemplateBuffer and return template buffer', async () => {
      const mockBuffer = Buffer.from('mock-template-data');
      excelService.buildTemplateBuffer.mockResolvedValue(mockBuffer);

      const result = await service.getImportTemplate();

      expect(excelService.buildTemplateBuffer).toHaveBeenCalledWith(
        expect.objectContaining({
          dataSheetName: 'المراحل الدراسية',
          instructionsSheetName: 'دليل الاستيراد',
        }),
      );
      expect(result).toBe(mockBuffer);
    });
  });

  describe('importFromExcel', () => {
    const fileBuffer = Buffer.from('mock-file');

    it('should throw BadRequestException if sheet has no data rows', async () => {
      excelService.parseSheetRows.mockResolvedValue({
        headers: ['اسم المرحلة الدراسية'],
        rows: [],
      });

      await expect(
        service.importFromExcel(centerId, fileBuffer),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw UnprocessableEntityException (422) if required name is empty', async () => {
      excelService.parseSheetRows.mockResolvedValue({
        headers: ['اسم المرحلة الدراسية', 'الترتيب'],
        rows: [
          { rowNumber: 2, values: { 'اسم المرحلة الدراسية': '', الترتيب: 1 } },
        ],
      });
      prisma.grade.findMany.mockResolvedValue([]);

      await expect(
        service.importFromExcel(centerId, fileBuffer),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('should throw UnprocessableEntityException (422) if duplicate name exists in same file', async () => {
      excelService.parseSheetRows.mockResolvedValue({
        headers: ['اسم المرحلة الدراسية'],
        rows: [
          {
            rowNumber: 2,
            values: { 'اسم المرحلة الدراسية': 'الصف الأول الثانوي' },
          },
          {
            rowNumber: 3,
            values: { 'اسم المرحلة الدراسية': 'الصف الأول الثانوي' },
          },
        ],
      });
      prisma.grade.findMany.mockResolvedValue([]);

      await expect(
        service.importFromExcel(centerId, fileBuffer),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('should throw UnprocessableEntityException (422) if grade already exists in this center', async () => {
      excelService.parseSheetRows.mockResolvedValue({
        headers: ['اسم المرحلة الدراسية'],
        rows: [
          {
            rowNumber: 2,
            values: { 'اسم المرحلة الدراسية': 'الصف الأول الثانوي' },
          },
        ],
      });
      prisma.grade.findMany.mockResolvedValue([{ name: 'الصف الأول الثانوي' }]);

      await expect(
        service.importFromExcel(centerId, fileBuffer),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('should support dryRun=true and return validated rows without committing to DB', async () => {
      excelService.parseSheetRows.mockResolvedValue({
        headers: ['اسم المرحلة الدراسية', 'الترتيب', 'الوصف'],
        rows: [
          {
            rowNumber: 2,
            values: {
              'اسم المرحلة الدراسية': 'الصف الأول الثانوي',
              الترتيب: 1,
              الوصف: 'مرحلة ثانوية',
            },
          },
        ],
      });
      prisma.grade.findMany.mockResolvedValue([]);

      const result = await service.importFromExcel(centerId, fileBuffer, true);

      expect(result.totalRows).toBe(1);
      expect(result.validRows).toBe(1);
      expect(result.failedRows).toBe(0);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should insert grades within prisma.$transaction when dryRun=false', async () => {
      excelService.parseSheetRows.mockResolvedValue({
        headers: ['اسم المرحلة الدراسية', 'الترتيب'],
        rows: [
          {
            rowNumber: 2,
            values: {
              'اسم المرحلة الدراسية': 'الصف الأول الثانوي',
              الترتيب: 1,
            },
          },
        ],
      });
      prisma.grade.findMany.mockResolvedValue([]);

      const mockTx = {
        grade: {
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
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(mockTx.grade.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            name: 'الصف الأول الثانوي',
            order: 1,
            centerId,
          }),
        ],
      });
    });
  });
});
