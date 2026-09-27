import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { HomeStatsResponseDto } from './dto/home-stats-response.dto';
import { GRACE_PERIOD_DAYS } from '../../common/constants';

const GRACE_PERIOD_MS = GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;

@Injectable()
export class HomeStatsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * جلب إحصائيات الصفحة الرئيسية الشاملة الخاصة بالمدير العام (SUPER_ADMIN):
   * يتم تنفيذ جميع عمليات العد والتجميع مباشرة على مستوى قاعدة البيانات (PostgreSQL)
   * عبر COUNT(*) و WHERE لضمان أعلى أداء وتقليل استهلاك الذاكرة وحجم البيانات المنقولة.
   */
  async getHomeStats(): Promise<HomeStatsResponseDto> {
    const now = new Date();
    // بداية اليوم الحالي عند منتصف الليل لمطابقة حقول Date بدقة
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
      0,
    );
    const graceStart = new Date(todayStart.getTime() - GRACE_PERIOD_MS);

    const [
      totalCenters,
      suspendedCenters,
      activeCenters,
      graceCenters,
      revenueAggregate,
      totalPlans,
      activePlans,
    ] = await Promise.all([
      // 1. إجمالي المراكز التعليمية
      this.prisma.center.count(),

      // 2. المراكز المعطلة يدوياً
      this.prisma.center.count({
        where: { isActive: false },
      }),

      // 3. المراكز السارية (Active): مفعلة ولديها اشتراك سارٍ
      this.prisma.center.count({
        where: {
          isActive: true,
          subscriptions: {
            some: {
              status: 'ACTIVE',
              endDate: { gte: todayStart },
            },
          },
        },
      }),

      // 4. المراكز في فترة السماح (Grace Period): مفعلة، ليس لديها اشتراك سارٍ، ولديها اشتراك انتهى خلال آخر 3 أيام
      this.prisma.center.count({
        where: {
          isActive: true,
          subscriptions: {
            none: {
              status: 'ACTIVE',
              endDate: { gte: todayStart },
            },
            some: {
              endDate: {
                lt: todayStart,
                gte: graceStart,
              },
            },
          },
        },
      }),

      // 5. إجمالي إيرادات الاشتراكات المحصلة
      this.prisma.subscriptionPayment.aggregate({
        _sum: { paid: true },
      }),

      // 6. إجمالي باقات الاشتراك
      this.prisma.subscriptionPlan.count(),

      // 7. باقات الاشتراك النشطة
      this.prisma.subscriptionPlan.count({
        where: { isActive: true },
      }),
    ]);

    // 8. المراكز المنتهية (Read Only): المتبقي من إجمالي المراكز بعد خصم السارية وفترة السماح والمعطلة
    const expiredCenters = Math.max(
      0,
      totalCenters - activeCenters - graceCenters - suspendedCenters,
    );

    const totalRevenue = revenueAggregate._sum.paid
      ? Number(revenueAggregate._sum.paid)
      : 0;

    return {
      totalRevenue,
      totalCenters,
      activeCenters,
      graceCenters,
      expiredCenters,
      suspendedCenters,
      activePlans,
      totalPlans,
    };
  }
}
