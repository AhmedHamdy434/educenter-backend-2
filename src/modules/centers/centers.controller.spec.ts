import { Test, TestingModule } from '@nestjs/testing';
import { CentersController } from './centers.controller';
import { CentersService } from './centers.service';

describe('CentersController', () => {
  let controller: CentersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CentersController],
      providers: [
        {
          provide: CentersService,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            updateStatus: jest.fn(),
            subscribe: jest.fn(),
            renew: jest.fn(),
            getMyCenter: jest.fn(),
            getMySubscriptionOverview: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<CentersController>(CentersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
