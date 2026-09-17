import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class SubscriptionExpiryService {
  private readonly logger = new Logger(SubscriptionExpiryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Daily cron job running at midnight for data hygiene:
   * Batch-updates all active center subscriptions that have passed their end date to EXPIRED status.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleSubscriptionExpiry(): Promise<{ count: number }> {
    this.logger.log('Starting daily subscription expiry check...');

    const result = await this.prisma.centerSubscription.updateMany({
      where: {
        status: 'ACTIVE',
        endDate: {
          lte: new Date(),
        },
      },
      data: {
        status: 'EXPIRED',
      },
    });

    this.logger.log(
      `Daily subscription expiry job finished. Marked ${result.count} subscription(s) as EXPIRED.`,
    );

    return result;
  }
}
