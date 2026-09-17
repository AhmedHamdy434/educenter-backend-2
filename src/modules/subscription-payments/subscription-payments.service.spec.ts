import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SubscriptionPaymentsService } from './subscription-payments.service';
import { PrismaService } from '../../database/prisma/prisma.service';

describe('SubscriptionPaymentsService', () => {
  let service: SubscriptionPaymentsService;
  let prismaMock: {
    center: {
      findUnique: jest.Mock;
    };
    centerSubscription: {
      findUnique: jest.Mock;
    };
    subscriptionPayment: {
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
  };

  beforeEach(async () => {
    prismaMock = {
      center: {
        findUnique: jest.fn(),
      },
      centerSubscription: {
        findUnique: jest.fn(),
      },
      subscriptionPayment: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionPaymentsService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<SubscriptionPaymentsService>(
      SubscriptionPaymentsService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const dto = {
      centerSubscriptionId: 'sub-1',
      amount: 500,
      periodStart: new Date('2026-08-01'),
      periodEnd: new Date('2026-09-01'),
      paymentMethod: 'cash',
      notes: 'تجديد يدوي',
    };

    it('should throw NotFoundException if center does not exist', async () => {
      prismaMock.center.findUnique.mockResolvedValueOnce(null);

      await expect(service.create('center-1', dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if center subscription does not match center', async () => {
      prismaMock.center.findUnique.mockResolvedValueOnce({ id: 'center-1' });
      prismaMock.centerSubscription.findUnique.mockResolvedValueOnce({
        id: 'sub-1',
        centerId: 'other-center',
      });

      await expect(service.create('center-1', dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should create and return subscription payment record', async () => {
      prismaMock.center.findUnique.mockResolvedValueOnce({ id: 'center-1' });
      prismaMock.centerSubscription.findUnique.mockResolvedValueOnce({
        id: 'sub-1',
        centerId: 'center-1',
      });
      const createdRecord = {
        id: 'pay-1',
        centerSubscriptionId: 'sub-1',
        centerId: 'center-1',
        amount: new Prisma.Decimal(500),
        periodStart: dto.periodStart,
        periodEnd: dto.periodEnd,
        paymentMethod: 'cash',
        notes: 'تجديد يدوي',
        paidAt: new Date(),
        createdAt: new Date(),
      };
      prismaMock.subscriptionPayment.create.mockResolvedValueOnce(
        createdRecord,
      );

      const result = await service.create('center-1', dto);
      expect(result).toEqual(createdRecord);
      expect(prismaMock.subscriptionPayment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            centerId: 'center-1',
            centerSubscriptionId: 'sub-1',
            amount: new Prisma.Decimal(500),
          }),
        }),
      );
    });
  });

  describe('findByCenter', () => {
    it('should throw NotFoundException if center does not exist', async () => {
      prismaMock.center.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.findByCenter('center-1', { page: 1, limit: 10 } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return paginated list of payments for the center', async () => {
      prismaMock.center.findUnique.mockResolvedValueOnce({ id: 'center-1' });
      prismaMock.subscriptionPayment.count.mockResolvedValueOnce(1);
      prismaMock.subscriptionPayment.findMany.mockResolvedValueOnce([
        { id: 'pay-1', centerId: 'center-1', amount: new Prisma.Decimal(500) },
      ]);

      const result = await service.findByCenter('center-1', {
        page: 1,
        limit: 10,
        skip: 0,
        take: 10,
      } as any);

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });

  describe('findAll', () => {
    it('should return all subscription payments with pagination', async () => {
      prismaMock.subscriptionPayment.count.mockResolvedValueOnce(2);
      prismaMock.subscriptionPayment.findMany.mockResolvedValueOnce([
        { id: 'pay-1', amount: new Prisma.Decimal(500) },
        { id: 'pay-2', amount: new Prisma.Decimal(1000) },
      ]);

      const result = await service.findAll({
        page: 1,
        limit: 10,
        skip: 0,
        take: 10,
      } as any);

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
    });
  });

  describe('getSummary', () => {
    it('should calculate total revenue and breakdown by month', async () => {
      prismaMock.subscriptionPayment.findMany.mockResolvedValueOnce([
        {
          amount: new Prisma.Decimal(500),
          paidAt: new Date('2026-08-05T10:00:00Z'),
        },
        {
          amount: new Prisma.Decimal(1200),
          paidAt: new Date('2026-08-15T12:00:00Z'),
        },
        {
          amount: new Prisma.Decimal(800),
          paidAt: new Date('2026-09-01T09:00:00Z'),
        },
      ]);

      const result = await service.getSummary({});

      expect(result.totalRevenue).toBe('2500.00');
      expect(result.breakdown).toEqual([
        { month: '2026-08', total: '1700.00' },
        { month: '2026-09', total: '800.00' },
      ]);
    });
  });
});
