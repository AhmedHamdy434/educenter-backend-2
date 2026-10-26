import { Test, TestingModule } from '@nestjs/testing';
import { ParentPortalService } from './parent-portal.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AppRole } from '../../common/enums/app-role.enum';

describe('ParentPortalService', () => {
  let service: ParentPortalService;
  let prismaService: {
    student: {
      findFirst: jest.Mock;
    };
    parentMagicToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
    };
    teacher: {
      findUnique: jest.Mock;
    };
    groupStudent: {
      findFirst: jest.Mock;
    };
  };

  beforeEach(async () => {
    prismaService = {
      student: {
        findFirst: jest.fn(),
      },
      parentMagicToken: {
        create: jest.fn(),
        findUnique: jest.fn(),
      },
      teacher: {
        findUnique: jest.fn(),
      },
      groupStudent: {
        findFirst: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ParentPortalService,
        {
          provide: PrismaService,
          useValue: prismaService,
        },
      ],
    }).compile();

    service = module.get<ParentPortalService>(ParentPortalService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateMagicToken', () => {
    it('should generate a 30-day magic token for an existing student', async () => {
      prismaService.student.findFirst.mockResolvedValueOnce({
        id: 'student-1',
        centerId: 'center-1',
      });
      prismaService.parentMagicToken.create.mockResolvedValueOnce({
        id: 'tok-1',
        token: 'generated-token-string',
      });

      const result = await service.generateMagicToken('student-1', 'center-1');

      expect(prismaService.parentMagicToken.create).toHaveBeenCalled();
      expect(result.token).toBeDefined();
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('should allow teacher to generate token if student is enrolled in their group', async () => {
      prismaService.student.findFirst.mockResolvedValueOnce({
        id: 'student-1',
        centerId: 'center-1',
      });
      prismaService.teacher.findUnique.mockResolvedValueOnce({
        id: 'teacher-1',
      });
      prismaService.groupStudent.findFirst.mockResolvedValueOnce({
        id: 'gs-1',
      });
      prismaService.parentMagicToken.create.mockResolvedValueOnce({
        id: 'tok-1',
        token: 'teacher-token-string',
      });

      const result = await service.generateMagicToken(
        'student-1',
        'center-1',
        AppRole.TEACHER,
        'user-teacher-1',
      );

      expect(result.token).toBeDefined();
      expect(prismaService.parentMagicToken.create).toHaveBeenCalled();
    });

    it('should throw ForbiddenException if teacher attempts to generate token for student not in their group', async () => {
      prismaService.student.findFirst.mockResolvedValueOnce({
        id: 'student-1',
        centerId: 'center-1',
      });
      prismaService.teacher.findUnique.mockResolvedValueOnce({
        id: 'teacher-1',
      });
      prismaService.groupStudent.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.generateMagicToken(
          'student-1',
          'center-1',
          AppRole.TEACHER,
          'user-teacher-1',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if student does not exist in center', async () => {
      prismaService.student.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.generateMagicToken('invalid-student', 'center-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getStudentReportByToken', () => {
    it('should return student academic and financial report if token is valid', async () => {
      prismaService.parentMagicToken.findUnique.mockResolvedValueOnce({
        id: 'tok-1',
        token: 'valid-token',
        expiresAt: new Date(Date.now() + 1000000),
        student: {
          id: 'student-1',
          parentPhone: '01000000000',
          user: { fullName: 'Student One', phone: '01011111111' },
          center: { id: 'center-1', name: 'Al-Amal Center' },
          groups: [],
          attendance: [],
        },
      });

      const result = await service.getStudentReportByToken('valid-token');

      expect(result.student.fullName).toBe('Student One');
      expect(result.center.name).toBe('Al-Amal Center');
    });

    it('should throw UnauthorizedException if magic token has expired', async () => {
      prismaService.parentMagicToken.findUnique.mockResolvedValueOnce({
        id: 'tok-1',
        token: 'expired-token',
        expiresAt: new Date(Date.now() - 100000), // in the past
        student: {},
      });

      await expect(
        service.getStudentReportByToken('expired-token'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw NotFoundException if token does not exist', async () => {
      prismaService.parentMagicToken.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.getStudentReportByToken('non-existent'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
