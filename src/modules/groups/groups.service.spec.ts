import {
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import { GroupsService } from './groups.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { ExcelService } from '../../shared/excel/excel.service';
import { PdfService } from '../../shared/pdf/pdf.service';
import { GroupQueryDto } from './dto/get-groups.dto';
import { AppRole } from '../../common/enums/app-role.enum';

describe('GroupsService - Export, Import & Sort', () => {
  let service: GroupsService;
  let prisma: {
    group: {
      findMany: jest.Mock;
      count: jest.Mock;
      createMany: jest.Mock;
      findFirst: jest.Mock;
      delete: jest.Mock;
    };
    grade: {
      findMany: jest.Mock;
    };
    subject: {
      findMany: jest.Mock;
    };
    teacher: {
      findMany: jest.Mock;
    };
  };
  let excelService: {
    buildWorkbookBuffer: jest.Mock;
    buildTemplateBuffer: jest.Mock;
    parseSheetRows: jest.Mock;
  };
  let pdfService: {
    buildTablePdfBuffer: jest.Mock;
  };

  const centerId = 'center-123';

  beforeEach(async () => {
    prisma = {
      group: {
        findMany: jest.fn(),
        count: jest.fn(),
        createMany: jest.fn(),
        findFirst: jest.fn(),
        delete: jest.fn(),
      },
      grade: {
        findMany: jest.fn(),
      },
      subject: {
        findMany: jest.fn(),
      },
      teacher: {
        findMany: jest.fn(),
      },
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
        GroupsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ExcelService, useValue: excelService },
        { provide: PdfService, useValue: pdfService },
      ],
    }).compile();

    service = module.get<GroupsService>(GroupsService);
  });

  describe('findAll', () => {
    it('should sort by students count when sortBy is students', async () => {
      prisma.group.count.mockResolvedValue(1);
      prisma.group.findMany.mockResolvedValue([]);

      const query = Object.assign(new GroupQueryDto(), {
        sortBy: 'students',
        sortOrder: 'desc' as const,
      });

      await service.findAll(centerId, query, AppRole.OWNER, 'user-1');

      expect(prisma.group.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { students: { _count: 'desc' } },
        }),
      );
    });

    it('should sort by scalar field when sortBy is monthlyFee', async () => {
      prisma.group.count.mockResolvedValue(1);
      prisma.group.findMany.mockResolvedValue([]);

      const query = Object.assign(new GroupQueryDto(), {
        sortBy: 'monthlyFee',
        sortOrder: 'asc' as const,
      });

      await service.findAll(centerId, query, AppRole.OWNER, 'user-1');

      expect(prisma.group.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { monthlyFee: 'asc' },
        }),
      );
    });
  });

  describe('exportToExcel', () => {
    it('should query groups scoped by centerId and generate Excel buffer', async () => {
      prisma.group.findMany.mockResolvedValue([
        {
          name: 'مجموعة 1',
          capacity: 30,
          monthlyFee: 250,
          startDate: new Date('2026-09-01'),
          isActive: true,
          grade: { name: 'الصف الأول الثانوي' },
          subject: { name: 'رياضيات' },
          teacher: { user: { fullName: 'أحمد محمود' } },
          schedule: [{ day: 'SUNDAY', hour: 14, minute: 0 }],
          _count: { students: 15 },
          createdAt: new Date('2026-09-01'),
        },
      ]);
      const mockBuffer = Buffer.from('mock-excel-data');
      excelService.buildWorkbookBuffer.mockResolvedValue(mockBuffer);

      const query = new GroupQueryDto();
      const result = await service.exportToExcel(
        centerId,
        query,
        AppRole.OWNER,
        'user-1',
      );

      expect(prisma.group.findMany).toHaveBeenCalled();
      expect(excelService.buildWorkbookBuffer).toHaveBeenCalledWith(
        expect.objectContaining({
          sheetName: 'المجموعات الدراسية',
        }),
      );
      expect(result).toBe(mockBuffer);
    });

    it('should stream to res if response object is provided', async () => {
      prisma.group.findMany.mockResolvedValue([]);
      const mockBuffer = Buffer.from('mock-excel-data');
      excelService.buildWorkbookBuffer.mockResolvedValue(mockBuffer);

      const query = new GroupQueryDto();
      const setHeader = jest.fn();
      const send = jest.fn();
      const res = { setHeader, send } as unknown as Response;

      await service.exportToExcel(
        centerId,
        query,
        AppRole.OWNER,
        'user-1',
        res,
      );

      expect(setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(send).toHaveBeenCalledWith(mockBuffer);
    });
  });

  describe('exportToPdf', () => {
    it('should query groups scoped by centerId and generate PDF buffer', async () => {
      prisma.group.findMany.mockResolvedValue([]);
      const mockBuffer = Buffer.from('mock-pdf-data');
      pdfService.buildTablePdfBuffer.mockResolvedValue(mockBuffer);

      const query = new GroupQueryDto();
      const result = await service.exportToPdf(
        centerId,
        query,
        AppRole.OWNER,
        'user-1',
      );

      expect(prisma.group.findMany).toHaveBeenCalled();
      expect(pdfService.buildTablePdfBuffer).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'تقرير المجموعات الدراسية',
          orientation: 'landscape',
        }),
      );
      expect(result).toBe(mockBuffer);
    });

    it('should stream to res if response object is provided', async () => {
      prisma.group.findMany.mockResolvedValue([]);
      const mockBuffer = Buffer.from('mock-pdf-data');
      pdfService.buildTablePdfBuffer.mockResolvedValue(mockBuffer);

      const query = new GroupQueryDto();
      const setHeader = jest.fn();
      const send = jest.fn();
      const res = { setHeader, send } as unknown as Response;

      await service.exportToPdf(centerId, query, AppRole.OWNER, 'user-1', res);

      expect(setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(send).toHaveBeenCalledWith(mockBuffer);
    });
  });

  describe('getImportTemplate', () => {
    it('should query center grades, subjects, and teachers and return template buffer', async () => {
      prisma.grade.findMany.mockResolvedValue([
        { id: 'grade-1', name: 'الصف الأول الثانوي' },
      ]);
      prisma.subject.findMany.mockResolvedValue([
        { id: 'sub-1', name: 'رياضيات', grade: { name: 'الصف الأول الثانوي' } },
      ]);
      prisma.teacher.findMany.mockResolvedValue([
        {
          id: 'teacher-1',
          user: { fullName: 'أحمد محمود' },
          subjects: [{ subject: { name: 'رياضيات' } }],
        },
      ]);

      const mockBuffer = Buffer.from('mock-groups-template');
      excelService.buildTemplateBuffer.mockResolvedValue(mockBuffer);

      const result = await service.getImportTemplate(centerId);

      expect(prisma.grade.findMany).toHaveBeenCalled();
      expect(prisma.subject.findMany).toHaveBeenCalled();
      expect(prisma.teacher.findMany).toHaveBeenCalled();
      expect(excelService.buildTemplateBuffer).toHaveBeenCalledWith(
        expect.objectContaining({
          dataSheetName: 'بيانات المجموعات',
          instructionsSheetName: 'دليل الاستيراد',
        }),
      );
      expect(result).toBe(mockBuffer);
    });
  });

  describe('importFromExcel', () => {
    const fileBuffer = Buffer.from('mock-file');

    beforeEach(() => {
      prisma.grade.findMany.mockResolvedValue([
        { id: 'grade-1', name: 'الصف الأول الثانوي' },
      ]);
      prisma.subject.findMany.mockResolvedValue([
        { id: 'sub-1', name: 'رياضيات', gradeId: 'grade-1' },
      ]);
      prisma.teacher.findMany.mockResolvedValue([
        {
          id: 'teacher-1',
          user: { fullName: 'أحمد محمود' },
          subjects: [{ subjectId: 'sub-1' }],
        },
      ]);
      prisma.group.findMany.mockResolvedValue([]);
    });

    it('should throw BadRequestException if file has no rows', async () => {
      excelService.parseSheetRows.mockResolvedValue({
        headers: ['اسم المجموعة'],
        rows: [],
      });

      await expect(
        service.importFromExcel(centerId, fileBuffer),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw UnprocessableEntityException (422) if validation fails', async () => {
      excelService.parseSheetRows.mockResolvedValue({
        headers: ['اسم المجموعة'],
        rows: [
          {
            rowNumber: 2,
            values: {
              'اسم المجموعة': 'م',
              'معرف المرحلة (Grade ID)': 'invalid-grade-id',
              'معرف المادة (Subject ID)': 'invalid-subject-id',
              'معرف المدرس (Teacher ID)': 'invalid-teacher-id',
              'الاشتراك الشهري': -10,
            },
          },
        ],
      });

      await expect(
        service.importFromExcel(centerId, fileBuffer),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('should throw 422 if subject does not belong to grade', async () => {
      prisma.subject.findMany.mockResolvedValue([
        { id: 'sub-1', name: 'رياضيات', gradeId: 'other-grade' },
      ]);

      excelService.parseSheetRows.mockResolvedValue({
        headers: ['اسم المجموعة'],
        rows: [
          {
            rowNumber: 2,
            values: {
              'اسم المجموعة': 'مجموعة النخبة',
              'معرف المرحلة (Grade ID)': 'grade-1',
              'معرف المادة (Subject ID)': 'sub-1',
              'معرف المدرس (Teacher ID)': 'teacher-1',
              'الاشتراك الشهري': 200,
            },
          },
        ],
      });

      await expect(
        service.importFromExcel(centerId, fileBuffer),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('should throw 422 if teacher does not teach subject', async () => {
      prisma.teacher.findMany.mockResolvedValue([
        {
          id: 'teacher-1',
          user: { fullName: 'أحمد محمود' },
          subjects: [{ subjectId: 'other-sub' }],
        },
      ]);

      excelService.parseSheetRows.mockResolvedValue({
        headers: ['اسم المجموعة'],
        rows: [
          {
            rowNumber: 2,
            values: {
              'اسم المجموعة': 'مجموعة النخبة',
              'معرف المرحلة (Grade ID)': 'grade-1',
              'معرف المادة (Subject ID)': 'sub-1',
              'معرف المدرس (Teacher ID)': 'teacher-1',
              'الاشتراك الشهري': 200,
            },
          },
        ],
      });

      await expect(
        service.importFromExcel(centerId, fileBuffer),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('should support dryRun and return preview without DB write', async () => {
      excelService.parseSheetRows.mockResolvedValue({
        headers: ['اسم المجموعة'],
        rows: [
          {
            rowNumber: 2,
            values: {
              'اسم المجموعة': 'مجموعة النخبة',
              'معرف المرحلة (Grade ID)': 'grade-1',
              'معرف المادة (Subject ID)': 'sub-1',
              'معرف المدرس (Teacher ID)': 'teacher-1',
              'الاشتراك الشهري': 200,
            },
          },
        ],
      });

      const result = await service.importFromExcel(centerId, fileBuffer, true);

      expect(result.totalRows).toBe(1);
      expect(result.validRows).toBe(1);
      expect(result.data?.[0].gradeId).toBe('grade-1');
      expect(result.data?.[0].subjectId).toBe('sub-1');
      expect(result.data?.[0].teacherId).toBe('teacher-1');
      expect(prisma.group.createMany).not.toHaveBeenCalled();
    });

    it('should insert groups in DB when dryRun is false', async () => {
      excelService.parseSheetRows.mockResolvedValue({
        headers: ['اسم المجموعة'],
        rows: [
          {
            rowNumber: 2,
            values: {
              'اسم المجموعة': 'مجموعة النخبة',
              'معرف المرحلة (Grade ID)': 'grade-1',
              'معرف المادة (Subject ID)': 'sub-1',
              'معرف المدرس (Teacher ID)': 'teacher-1',
              'الاشتراك الشهري': 200,
            },
          },
        ],
      });

      const result = await service.importFromExcel(centerId, fileBuffer, false);

      expect(result.totalRows).toBe(1);
      expect(result.validRows).toBe(1);
      expect(prisma.group.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            centerId,
            name: 'مجموعة النخبة',
            gradeId: 'grade-1',
            subjectId: 'sub-1',
            teacherId: 'teacher-1',
            monthlyFee: 200,
          }),
        ],
      });
    });
  });

  describe('remove', () => {
    it('should throw NotFoundException if group not found', async () => {
      prisma.group.findFirst.mockResolvedValue(null);

      await expect(service.remove(centerId, 'group-non-existent')).rejects.toThrow(
        'المجموعة الدراسية المطلوبة غير موجودة.',
      );
    });

    it('should throw BadRequestException if group has enrolled students', async () => {
      prisma.group.findFirst.mockResolvedValue({
        id: 'group-1',
        _count: { students: 5 },
      });

      await expect(service.remove(centerId, 'group-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should delete group when there are no enrolled students', async () => {
      prisma.group.findFirst.mockResolvedValue({
        id: 'group-1',
        _count: { students: 0 },
      });
      prisma.group.delete.mockResolvedValue({ id: 'group-1' });

      await service.remove(centerId, 'group-1');

      expect(prisma.group.delete).toHaveBeenCalledWith({
        where: { id: 'group-1' },
      });
    });
  });
});
