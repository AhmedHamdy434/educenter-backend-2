import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { buildMeta, PaginationMeta } from '../../common/utils/buildMeta';
import { CreateSubscriptionPaymentDto } from './dto/create-subscription-payment.dto';
import { GetSubscriptionPaymentsDto } from './dto/get-subscription-payments.dto';
import { SubscriptionPaymentSummaryDto } from './dto/subscription-payment-summary.dto';
import {
  subscriptionPaymentListSelect,
  SubscriptionPaymentListItem,
  SubscriptionRevenueSummary,
} from './constants/subscription-payment.select';

@Injectable()
export class SubscriptionPaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * إنشاء دفعة اشتراك جديدة لمركز تعليمي يدويًا.
   */
  async create(
    centerId: string,
    dto: CreateSubscriptionPaymentDto,
  ): Promise<SubscriptionPaymentListItem> {
    const center = await this.prisma.center.findUnique({
      where: { id: centerId },
      select: { id: true },
    });

    if (!center) {
      throw new NotFoundException('المركز التعليمي غير موجود.');
    }

    const subscription = await this.prisma.centerSubscription.findUnique({
      where: { id: dto.centerSubscriptionId },
      select: { id: true, centerId: true },
    });

    if (!subscription || subscription.centerId !== centerId) {
      throw new BadRequestException(
        'اشتراك المركز غير موجود أو لا ينتمي لهذا المركز التعليمي.',
      );
    }

    return this.prisma.subscriptionPayment.create({
      data: {
        centerId,
        centerSubscriptionId: dto.centerSubscriptionId,
        amount: new Prisma.Decimal(dto.amount),
        periodStart: dto.periodStart,
        periodEnd: dto.periodEnd,
        paymentMethod: dto.paymentMethod,
        notes: dto.notes,
      },
      select: subscriptionPaymentListSelect,
    });
  }

  /**
   * جلب دفعات اشتراك مركز معين مع دعم الفلترة بالتاريخ والصفحات.
   */
  async findByCenter(
    centerId: string,
    query: GetSubscriptionPaymentsDto,
  ): Promise<{ data: SubscriptionPaymentListItem[]; meta: PaginationMeta }> {
    const center = await this.prisma.center.findUnique({
      where: { id: centerId },
      select: { id: true },
    });

    if (!center) {
      throw new NotFoundException('المركز التعليمي غير موجود.');
    }

    const where: Prisma.SubscriptionPaymentWhereInput = {
      centerId,
    };

    if (query.from || query.to) {
      where.paidAt = {
        ...(query.from ? { gte: query.from } : {}),
        ...(query.to ? { lte: query.to } : {}),
      };
    }

    if (query.search) {
      where.OR = [
        { paymentMethod: { contains: query.search, mode: 'insensitive' } },
        { notes: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.subscriptionPayment.count({ where }),
      this.prisma.subscriptionPayment.findMany({
        where,
        select: subscriptionPaymentListSelect,
        skip: query.skip,
        take: query.take,
        orderBy: { paidAt: 'desc' },
      }),
    ]);

    return {
      data,
      meta: buildMeta(total, query.page, query.limit),
    };
  }

  /**
   * جلب كل دفعات الاشتراكات للمنصة (للمدير العام) مع دعم الفلترة والصفحات.
   */
  async findAll(
    query: GetSubscriptionPaymentsDto,
  ): Promise<{ data: SubscriptionPaymentListItem[]; meta: PaginationMeta }> {
    const where: Prisma.SubscriptionPaymentWhereInput = {};

    if (query.centerId) {
      where.centerId = query.centerId;
    }

    if (query.from || query.to) {
      where.paidAt = {
        ...(query.from ? { gte: query.from } : {}),
        ...(query.to ? { lte: query.to } : {}),
      };
    }

    if (query.search) {
      where.OR = [
        {
          center: {
            name: { contains: query.search, mode: 'insensitive' },
          },
        },
        { paymentMethod: { contains: query.search, mode: 'insensitive' } },
        { notes: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.subscriptionPayment.count({ where }),
      this.prisma.subscriptionPayment.findMany({
        where,
        select: subscriptionPaymentListSelect,
        skip: query.skip,
        take: query.take,
        orderBy: { paidAt: 'desc' },
      }),
    ]);

    return {
      data,
      meta: buildMeta(total, query.page, query.limit),
    };
  }

  /**
   * حساب إجمالي أرباح الاشتراكات وتوزيعها شهرياً.
   */
  async getSummary(
    query: SubscriptionPaymentSummaryDto,
  ): Promise<SubscriptionRevenueSummary> {
    const where: Prisma.SubscriptionPaymentWhereInput = {};

    if (query.from || query.to) {
      where.paidAt = {
        ...(query.from ? { gte: query.from } : {}),
        ...(query.to ? { lte: query.to } : {}),
      };
    }

    const payments = await this.prisma.subscriptionPayment.findMany({
      where,
      select: {
        amount: true,
        paidAt: true,
      },
      orderBy: { paidAt: 'asc' },
    });

    let totalRevenueDecimal = new Prisma.Decimal(0);
    const monthlyMap = new Map<string, Prisma.Decimal>();

    for (const payment of payments) {
      totalRevenueDecimal = totalRevenueDecimal.plus(payment.amount);

      const d = new Date(payment.paidAt);
      const year = d.getUTCFullYear();
      const month = String(d.getUTCMonth() + 1).padStart(2, '0');
      const key = `${year}-${month}`;

      const currentMonthTotal = monthlyMap.get(key) || new Prisma.Decimal(0);
      monthlyMap.set(key, currentMonthTotal.plus(payment.amount));
    }

    const breakdown = Array.from(monthlyMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, total]) => ({
        month,
        total: total.toFixed(2),
      }));

    return {
      totalRevenue: totalRevenueDecimal.toFixed(2),
      breakdown,
    };
  }
}
