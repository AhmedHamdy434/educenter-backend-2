import { Test, TestingModule } from '@nestjs/testing';
import { HomeStatsService } from './home-stats.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { Prisma } from '@prisma/client';

describe('HomeStatsService', () => {
  let service: HomeStatsService;
  let prisma: PrismaService;

  const mockPrisma = {
    center: {
      count: jest.fn(),
    },
    subscriptionPayment: {
      aggregate: jest.fn(),
    },
    subscriptionPlan: {
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HomeStatsService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<HomeStatsService>(HomeStatsService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should execute counts directly in PostgreSQL and return correct home stats', async () => {
    // 1. center.count mocks in order of Promise.all:
    // 1) totalCenters = 5
    // 2) suspendedCenters = 1
    // 3) activeCenters = 1
    // 4) graceCenters = 1
    mockPrisma.center.count
      .mockResolvedValueOnce(5) // totalCenters
      .mockResolvedValueOnce(1) // suspendedCenters
      .mockResolvedValueOnce(1) // activeCenters
      .mockResolvedValueOnce(1); // graceCenters

    // 2. revenue aggregate
    mockPrisma.subscriptionPayment.aggregate.mockResolvedValue({
      _sum: { paid: new Prisma.Decimal(35024) },
    });

    // 3. subscriptionPlan.count mocks in order:
    // 1) totalPlans = 5
    // 2) activePlans = 4
    mockPrisma.subscriptionPlan.count
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(4);

    const result = await service.getHomeStats();

    // expiredCenters = total(5) - active(1) - grace(1) - suspended(1) = 2
    expect(result).toEqual({
      totalRevenue: 35024,
      totalCenters: 5,
      activeCenters: 1,
      graceCenters: 1,
      expiredCenters: 2,
      suspendedCenters: 1,
      activePlans: 4,
      totalPlans: 5,
    });

    expect(mockPrisma.center.count).toHaveBeenCalledTimes(4);
    expect(mockPrisma.subscriptionPayment.aggregate).toHaveBeenCalledTimes(1);
    expect(mockPrisma.subscriptionPlan.count).toHaveBeenCalledTimes(2);
  });

  it('should handle zero revenue when no payments exist', async () => {
    mockPrisma.center.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    mockPrisma.subscriptionPayment.aggregate.mockResolvedValue({
      _sum: { paid: null },
    });

    mockPrisma.subscriptionPlan.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    const result = await service.getHomeStats();

    expect(result).toEqual({
      totalRevenue: 0,
      totalCenters: 0,
      activeCenters: 0,
      graceCenters: 0,
      expiredCenters: 0,
      suspendedCenters: 0,
      activePlans: 0,
      totalPlans: 0,
    });
  });
});
