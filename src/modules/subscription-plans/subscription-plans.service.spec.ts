import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionPlansService } from './subscription-plans.service';
import { PrismaService } from '../../database/prisma/prisma.service';

describe('SubscriptionPlansService', () => {
  let service: SubscriptionPlansService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionPlansService,
        {
          provide: PrismaService,
          useValue: {
            subscriptionPlan: {
              findUnique: jest.fn(),
              findMany: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              count: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<SubscriptionPlansService>(SubscriptionPlansService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
