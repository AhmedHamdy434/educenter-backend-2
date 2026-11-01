import { Test, TestingModule } from '@nestjs/testing';
import { ScheduleController } from './schedule.controller';
import { ScheduleService } from './schedule.service';
import { SubscriptionValidationService } from '../subscription-plans/subscription-validation.service';

describe('ScheduleController', () => {
  let controller: ScheduleController;
  let service: {
    getCalendarSchedule: jest.Mock;
    getUpcomingSchedule: jest.Mock;
  };

  const centerId = 'center-123';

  beforeEach(async () => {
    service = {
      getCalendarSchedule: jest.fn(),
      getUpcomingSchedule: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ScheduleController],
      providers: [
        {
          provide: ScheduleService,
          useValue: service,
        },
        {
          provide: SubscriptionValidationService,
          useValue: {
            validateSubscriptionAccess: jest.fn(),
            validateActiveSubscription: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<ScheduleController>(ScheduleController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call scheduleService.getCalendarSchedule with centerId and query', async () => {
    const query = { month: '2026-10', teacherId: 't-1' };
    const expectedResult = {
      month: '2026-10',
      range: { from: '2026-10-01', to: '2026-10-31' },
      sessions: [],
    };
    service.getCalendarSchedule.mockResolvedValue(expectedResult);

    const result = await controller.getCalendarSchedule(centerId, query);

    expect(service.getCalendarSchedule).toHaveBeenCalledWith(centerId, query);
    expect(result).toEqual(expectedResult);
  });

  it('should call scheduleService.getUpcomingSchedule with centerId and query', async () => {
    const query = { gradeId: 'g-1' };
    const expectedResult = {
      range: { from: '2026-10-31', to: '2026-10-31' },
      sessions: [],
    };
    service.getUpcomingSchedule.mockResolvedValue(expectedResult);

    const result = await controller.getUpcomingSchedule(centerId, query);

    expect(service.getUpcomingSchedule).toHaveBeenCalledWith(centerId, query);
    expect(result).toEqual(expectedResult);
  });
});
