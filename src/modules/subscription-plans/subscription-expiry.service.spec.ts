import { SubscriptionExpiryService } from './subscription-expiry.service';
import { PrismaService } from '../../database/prisma/prisma.service';

describe('SubscriptionExpiryService', () => {
  let service: SubscriptionExpiryService;
  let prisma: {
    centerSubscription: {
      updateMany: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      centerSubscription: {
        updateMany: jest.fn(),
      },
    };
    service = new SubscriptionExpiryService(prisma as unknown as PrismaService);
  });

  it('should batch update active subscriptions with past end dates to EXPIRED', async () => {
    prisma.centerSubscription.updateMany.mockResolvedValueOnce({
      count: 3,
    });

    const result = await service.handleSubscriptionExpiry();

    expect(result).toEqual({ count: 3 });
    expect(prisma.centerSubscription.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.centerSubscription.updateMany).toHaveBeenCalledWith({
      where: {
        status: 'ACTIVE',
        endDate: {
          lt: expect.any(Date) as Date,
        },
      },
      data: {
        status: 'EXPIRED',
      },
    });
  });
});
