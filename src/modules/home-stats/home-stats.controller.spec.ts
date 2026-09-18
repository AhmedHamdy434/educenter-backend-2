import { Test, TestingModule } from '@nestjs/testing';
import { HomeStatsController } from './home-stats.controller';
import { HomeStatsService } from './home-stats.service';
import { HomeStatsResponseDto } from './dto/home-stats-response.dto';

describe('HomeStatsController', () => {
  let controller: HomeStatsController;
  let service: HomeStatsService;

  const mockStats: HomeStatsResponseDto = {
    totalRevenue: 35024,
    totalCenters: 4,
    activeCenters: 4,
    graceCenters: 0,
    expiredCenters: 0,
    suspendedCenters: 0,
    activePlans: 4,
    totalPlans: 4,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HomeStatsController],
      providers: [
        {
          provide: HomeStatsService,
          useValue: {
            getHomeStats: jest.fn().mockResolvedValue(mockStats),
          },
        },
      ],
    }).compile();

    controller = module.get<HomeStatsController>(HomeStatsController);
    service = module.get<HomeStatsService>(HomeStatsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return home stats correctly', async () => {
    const result = await controller.getHomeStats();
    expect(result).toEqual(mockStats);
    expect(service.getHomeStats).toHaveBeenCalled();
  });
});
