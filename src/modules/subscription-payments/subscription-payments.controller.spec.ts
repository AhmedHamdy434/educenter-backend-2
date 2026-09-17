import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionPaymentsController } from './subscription-payments.controller';
import { CenterSubscriptionPaymentsController } from './center-subscription-payments.controller';
import { SubscriptionPaymentsService } from './subscription-payments.service';

describe('SubscriptionPaymentsControllers', () => {
  let mainController: SubscriptionPaymentsController;
  let centerController: CenterSubscriptionPaymentsController;
  let service: {
    create: jest.Mock;
    findByCenter: jest.Mock;
    findAll: jest.Mock;
    getSummary: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      create: jest.fn(),
      findByCenter: jest.fn(),
      findAll: jest.fn(),
      getSummary: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [
        SubscriptionPaymentsController,
        CenterSubscriptionPaymentsController,
      ],
      providers: [
        {
          provide: SubscriptionPaymentsService,
          useValue: service,
        },
      ],
    }).compile();

    mainController = module.get<SubscriptionPaymentsController>(
      SubscriptionPaymentsController,
    );
    centerController = module.get<CenterSubscriptionPaymentsController>(
      CenterSubscriptionPaymentsController,
    );
  });

  it('should be defined', () => {
    expect(mainController).toBeDefined();
    expect(centerController).toBeDefined();
  });

  it('should call getSummary on summary endpoint', async () => {
    const summaryData = { totalRevenue: '5000.00', breakdown: [] };
    service.getSummary.mockResolvedValueOnce(summaryData);

    const result = await mainController.getSummary({});
    expect(service.getSummary).toHaveBeenCalledWith({});
    expect(result).toBe(summaryData);
  });

  it('should call findAll on global list endpoint', async () => {
    const listData = { data: [], meta: {} as any };
    service.findAll.mockResolvedValueOnce(listData);

    const query = { page: 1, limit: 10 } as any;
    const result = await mainController.findAll(query);
    expect(service.findAll).toHaveBeenCalledWith(query);
    expect(result).toBe(listData);
  });

  it('should call create on center payment creation endpoint', async () => {
    const dto = {
      centerSubscriptionId: 'sub-1',
      paid: 300,
      periodStart: new Date(),
      periodEnd: new Date(),
    };
    const payment = { id: 'p-1' } as any;
    service.create.mockResolvedValueOnce(payment);

    const result = await centerController.create('center-1', dto);
    expect(service.create).toHaveBeenCalledWith('center-1', dto);
    expect(result).toBe(payment);
  });

  it('should call findByCenter on center payment list endpoint', async () => {
    const listData = { data: [], meta: {} as any };
    service.findByCenter.mockResolvedValueOnce(listData);

    const query = { page: 1, limit: 10 } as any;
    const result = await centerController.findByCenter('center-1', query);
    expect(service.findByCenter).toHaveBeenCalledWith('center-1', query);
    expect(result).toBe(listData);
  });
});
