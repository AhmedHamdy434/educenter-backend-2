import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionPlansController } from './subscription-plans.controller';
import { SubscriptionPlansService } from './subscription-plans.service';

describe('SubscriptionPlansController', () => {
  let controller: SubscriptionPlansController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubscriptionPlansController],
      providers: [
        {
          provide: SubscriptionPlansService,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            toggleStatus: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<SubscriptionPlansController>(
      SubscriptionPlansController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
