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
import { GroupStudentsQueryDto } from './dto/get-group-students.dto';
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
      findUnique: jest.Mock;
    };
    groupStudent: {
      findMany: jest.Mock;
      count: jest.Mock;
    };
    student: {
      findMany: jest.Mock;
    };
    monthlyPayment: {
      count: jest.Mock;
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
        findUnique: jest.fn(),
      },
      groupStudent: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
      student: {
        findMany: jest.fn(),
      },
      monthlyPayment: {
        count: jest.fn(),
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

      await expect(
        service.remove(centerId, 'group-non-existent'),
      ).rejects.toThrow('المجموعة الدراسية المطلوبة غير موجودة.');
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

    it('should throw BadRequestException if group has attendance sessions', async () => {
      prisma.group.findFirst.mockResolvedValue({
        id: 'group-1',
        _count: { students: 0, attendanceSessions: 3 },
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

  describe('removeStudents', () => {
    it('should throw BadRequestException if student has monthly payments in the group', async () => {
      const mockTx = {
        group: {
          findFirst: jest.fn().mockResolvedValue({ id: 'group-1', centerId }),
        },
        monthlyPayment: {
          count: jest.fn().mockResolvedValue(1),
        },
        groupStudent: {
          deleteMany: jest.fn(),
        },
      };

      prisma.$transaction.mockImplementation(
        async (cb: (tx: any) => Promise<any>) => cb(mockTx),
      );

      await expect(
        service.removeStudents(centerId, 'group-1', { studentIds: ['stu-1'] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should remove students if no monthly payments exist', async () => {
      const mockTx = {
        group: {
          findFirst: jest.fn().mockResolvedValue({ id: 'group-1', centerId }),
          findUnique: jest
            .fn()
            .mockResolvedValue({ id: 'group-1', name: 'Group 1' }),
        },
        monthlyPayment: {
          count: jest.fn().mockResolvedValue(0),
        },
        groupStudent: {
          deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };

      prisma.$transaction.mockImplementation(
        async (cb: (tx: any) => Promise<any>) => cb(mockTx),
      );

      const result = await service.removeStudents(centerId, 'group-1', {
        studentIds: ['stu-1'],
      });

      expect(mockTx.groupStudent.deleteMany).toHaveBeenCalledWith({
        where: {
          groupId: 'group-1',
          studentId: { in: ['stu-1'] },
        },
      });
      expect(result).toBeDefined();
    });
  });

  describe('findStudents', () => {
    const mockStudents = [
      {
        id: 'gs-1',
        groupId: 'group-1',
        studentId: 'stu-1',
        joinedAt: new Date(),
        subscriptionStartDate: new Date(),
        student: {
          id: 'stu-1',
          code: 'STU-1',
          parentPhone: '01011111111',
          user: {
            id: 'u-1',
            fullName: 'Ahmed Ali',
            email: 'ahmed@test.com',
            phone: '01011111111',
            avatar: null,
            isActive: true,
          },
        },
      },
    ];

    it('should return paginated enrolled students with default meta and sorting', async () => {
      prisma.group.findFirst.mockResolvedValue({
        id: 'group-1',
        name: 'Group 1',
        gradeId: 'grade-1',
        teacherId: 'teacher-1',
        isActive: true,
      });

      prisma.groupStudent.count.mockResolvedValue(1);
      prisma.groupStudent.findMany.mockResolvedValue(mockStudents);

      const query = new GroupStudentsQueryDto();
      const result = await service.findStudents(
        centerId,
        'group-1',
        AppRole.OWNER,
        'user-1',
        query,
      );

      expect(result).toEqual({
        data: mockStudents,
        meta: {
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      });

      expect(prisma.groupStudent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            groupId: 'group-1',
            centerId,
          }),
          skip: 0,
          take: 10,
          orderBy: [{ joinedAt: 'desc' }],
        }),
      );
    });

    it('should support custom pagination and sorting by subscriptionStartDate', async () => {
      prisma.group.findFirst.mockResolvedValue({
        id: 'group-1',
        name: 'Group 1',
        teacherId: 'teacher-1',
        isActive: true,
      });

      prisma.groupStudent.count.mockResolvedValue(25);
      prisma.groupStudent.findMany.mockResolvedValue(mockStudents);

      const query = Object.assign(new GroupStudentsQueryDto(), {
        page: 2,
        limit: 10,
        sortBy: 'subscriptionStartDate',
        sortOrder: 'asc' as const,
      });

      const result = await service.findStudents(
        centerId,
        'group-1',
        AppRole.OWNER,
        'user-1',
        query,
      );

      expect(result.meta).toEqual({
        total: 25,
        page: 2,
        limit: 10,
        totalPages: 3,
        hasNextPage: true,
        hasPreviousPage: true,
      });

      expect(prisma.groupStudent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
          orderBy: { subscriptionStartDate: 'asc' },
        }),
      );
    });

    it('should support search filter with default sorting', async () => {
      prisma.group.findFirst.mockResolvedValue({
        id: 'group-1',
        name: 'Group 1',
        teacherId: 'teacher-1',
        isActive: true,
      });

      prisma.groupStudent.count.mockResolvedValue(1);
      prisma.groupStudent.findMany.mockResolvedValue(mockStudents);

      const query = Object.assign(new GroupStudentsQueryDto(), {
        search: 'STU-1',
      });

      await service.findStudents(
        centerId,
        'group-1',
        AppRole.OWNER,
        'user-1',
        query,
      );

      expect(prisma.groupStudent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            student: expect.objectContaining({
              OR: expect.arrayContaining([
                { code: { contains: 'STU-1', mode: 'insensitive' } },
              ]),
            }),
          }),
          orderBy: [{ joinedAt: 'desc' }],
        }),
      );
    });

    it('should throw ForbiddenException if teacher does not own the group', async () => {
      prisma.group.findFirst.mockResolvedValue({
        id: 'group-1',
        teacherId: 'teacher-other',
      });
      prisma.teacher.findUnique.mockResolvedValue({ id: 'teacher-mine' });

      await expect(
        service.findStudents(
          centerId,
          'group-1',
          AppRole.TEACHER,
          'user-teacher',
          new GroupStudentsQueryDto(),
        ),
      ).rejects.toThrow('ليس لديك صلاحية للوصول إلى هذه المجموعة الدراسية.');
    });
  });

  describe('findStudentsNotEnrolled', () => {
    it('should return students eligible to be added to group', async () => {
      prisma.group.findFirst.mockResolvedValue({
        id: 'group-1',
        gradeId: 'grade-1',
        teacherId: 'teacher-1',
        isActive: true,
      });

      const mockCandidates = [
        {
          id: 'stu-2',
          code: 'STU-2',
          parentPhone: '01022222222',
          user: {
            id: 'u-2',
            fullName: 'Sara Mohamed',
            email: 'sara@test.com',
            phone: '01022222222',
            avatar: null,
            isActive: true,
          },
          enrollments: [
            {
              id: 'en-2',
              gradeId: 'grade-1',
              isActive: true,
              grade: { id: 'grade-1', name: 'Grade 1' },
            },
          ],
        },
      ];

      prisma.student.findMany.mockResolvedValue(mockCandidates);

      const result = await service.findStudentsNotEnrolled(
        centerId,
        'group-1',
        AppRole.OWNER,
        'user-1',
      );

      expect(result).toEqual(mockCandidates);
      expect(prisma.student.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            centerId,
            user: expect.objectContaining({ isActive: true }),
            enrollments: expect.objectContaining({
              some: expect.objectContaining({
                gradeId: 'grade-1',
                isActive: true,
              }),
            }),
            groups: expect.objectContaining({
              none: { groupId: 'group-1' },
            }),
          }),
        }),
      );
    });

    it('should throw BadRequestException if group is inactive', async () => {
      prisma.group.findFirst.mockResolvedValue({
        id: 'group-1',
        gradeId: 'grade-1',
        isActive: false,
      });

      await expect(
        service.findStudentsNotEnrolled(
          centerId,
          'group-1',
          AppRole.OWNER,
          'user-1',
        ),
      ).rejects.toThrow('لا يمكن إضافة طلاب إلى مجموعة دراسية معطلة.');
    });
  });
});
