import { Test, TestingModule } from '@nestjs/testing';
import { GroupsService } from './groups.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { ExcelService } from '../../shared/excel/excel.service';
import { GroupQueryDto } from './dto/get-groups.dto';
import { AppRole } from '../../common/enums/app-role.enum';

describe('GroupsService - Excel Export', () => {
  let service: GroupsService;
  let prisma: {
    group: {
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
        findMany: jest.fn(),
      },
    };

    excelService = {
      buildWorkbookBuffer: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroupsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ExcelService, useValue: excelService },
      ],
    }).compile();

    service = module.get<GroupsService>(GroupsService);
  });

  describe('exportToExcel', () => {
    it('should export groups with schedule and center scoping', async () => {
      const query = new GroupQueryDto();
      query.active = true;

      const mockGroups = [
        {
          name: 'مجموعة الفيزياء 1',
          capacity: 30,
          monthlyFee: 250,
          startDate: new Date('2026-10-01'),
          isActive: true,
          grade: { name: 'الصف الأول الثانوي' },
          subject: { name: 'فيزياء' },
          teacher: { user: { fullName: 'أحمد محمود' } },
          schedule: [
            { day: 'SUNDAY', hour: 16, minute: 0 },
            { day: 'TUESDAY', hour: 18, minute: 30 },
          ],
          _count: { students: 15 },
        },
      ];

      prisma.group.findMany.mockResolvedValue(mockGroups);
      excelService.buildWorkbookBuffer.mockResolvedValue(
        Buffer.from('excel-data'),
      );

      const result = await service.exportToExcel(
        centerId,
        query,
        AppRole.OWNER,
        'user-1',
      );

      const calls = prisma.group.findMany.mock.calls as unknown as Array<
        [{ where: { centerId: string; isActive: boolean } }]
      >;
      expect(calls[0][0].where.centerId).toBe(centerId);
      expect(calls[0][0].where.isActive).toBe(true);

      expect(excelService.buildWorkbookBuffer).toHaveBeenCalledWith(
        expect.objectContaining({
          sheetName: 'المجموعات الدراسية',
          data: [
            expect.objectContaining({
              name: 'مجموعة الفيزياء 1',
              gradeName: 'الصف الأول الثانوي',
              subjectName: 'فيزياء',
              teacherName: 'أحمد محمود',
              monthlyFee: '250.00',
              studentsCount: 15,
              capacity: '30',
              schedule: 'الأحد (16:00) | الثلاثاء (18:30)',
              status: 'نشط',
              startDate: '2026-10-01',
            }),
          ],
        }),
      );

      expect(result).toEqual(Buffer.from('excel-data'));
    });

    it('should apply teacher scoping when currentUserRole is TEACHER', async () => {
      const query = new GroupQueryDto();
      prisma.group.findMany.mockResolvedValue([]);
      excelService.buildWorkbookBuffer.mockResolvedValue(
        Buffer.from('excel-data'),
      );

      await service.exportToExcel(
        centerId,
        query,
        AppRole.TEACHER,
        'teacher-user-id',
      );

      const teacherCalls = prisma.group.findMany.mock.calls as unknown as Array<
        [{ where: { centerId: string; teacher: { userId: string } } }]
      >;
      expect(teacherCalls[1][0].where.centerId).toBe(centerId);
      expect(teacherCalls[1][0].where.teacher.userId).toBe('teacher-user-id');
    });
  });
});
