import { Test, TestingModule } from '@nestjs/testing';
import { AuditLogsService } from './audit-logs.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuditAction } from '@prisma/client';
import { AuditLogQueryDto } from './dto/get-audit-logs.dto';

describe('AuditLogsService', () => {
  let service: AuditLogsService;
  let prismaService: {
    auditLog: {
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
  };

  beforeEach(async () => {
    prismaService = {
      auditLog: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogsService,
        {
          provide: PrismaService,
          useValue: prismaService,
        },
      ],
    }).compile();

    service = module.get<AuditLogsService>(AuditLogsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('log', () => {
    it('should create an audit log entry', async () => {
      prismaService.auditLog.create.mockResolvedValueOnce({
        id: 'log-1',
        action: AuditAction.PAYMENT_COLLECTION,
      });

      const result = await service.log({
        centerId: 'center-1',
        userId: 'user-1',
        action: AuditAction.PAYMENT_COLLECTION,
        entity: 'MonthlyPayment',
        entityId: 'pay-1',
        details: { amount: 500 },
      });

      expect(prismaService.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            centerId: 'center-1',
            action: AuditAction.PAYMENT_COLLECTION,
            entity: 'MonthlyPayment',
            entityId: 'pay-1',
          }) as unknown,
        }),
      );
      expect(result.id).toBe('log-1');
    });
  });

  describe('findAll', () => {
    it('should query audit logs for center', async () => {
      prismaService.auditLog.count.mockResolvedValueOnce(1);
      prismaService.auditLog.findMany.mockResolvedValueOnce([
        { id: 'log-1', action: AuditAction.CREATE, centerId: 'center-1' },
      ]);

      const query = new AuditLogQueryDto();
      const result = await service.findAll('center-1', query);

      expect(prismaService.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ centerId: 'center-1' }) as unknown,
        }),
      );
      expect(result.data.length).toBe(1);
      expect(result.meta.total).toBe(1);
    });
  });
});
