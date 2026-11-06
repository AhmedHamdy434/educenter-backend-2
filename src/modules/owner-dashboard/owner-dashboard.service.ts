import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import {
  Prisma,
  SettlementStatus,
  TeacherEarningType,
  ObligationStatus,
} from '@prisma/client';
import {
  DashboardPeriod,
  GetOwnerDashboardDto,
} from './dto/get-owner-dashboard.dto';
import { GRACE_PERIOD_DAYS } from '../../common/constants';

@Injectable()
export class OwnerDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * استخراج نطاق التواريخ بناءً على الفترة المطلوبة.
   */
  private getDateRange(dto: GetOwnerDashboardDto): { from?: Date; to?: Date } {
    const now = new Date();
    const period = dto.period || DashboardPeriod.MONTH;

    if (period === DashboardPeriod.ALL) {
      return {};
    }

    if (period === DashboardPeriod.CUSTOM) {
      return {
        from: dto.from ? new Date(dto.from) : undefined,
        to: dto.to
          ? new Date(new Date(dto.to).setHours(23, 59, 59, 999))
          : undefined,
      };
    }

    const to = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999,
    );
    let from: Date;

    switch (period) {
      case DashboardPeriod.TODAY:
        from = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          0,
          0,
          0,
          0,
        );
        break;
      case DashboardPeriod.WEEK:
        from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        from.setHours(0, 0, 0, 0);
        break;
      case DashboardPeriod.MONTH:
        from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        break;
      case DashboardPeriod.YEAR:
        from = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
        break;
      default:
        from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    }

    return { from, to };
  }

  /**
   * جلب مؤشرات لوحة التحكم الشاملة لمالك السنتر.
   */
  async getDashboardData(centerId: string, dto: GetOwnerDashboardDto) {
    const { from, to } = this.getDateRange(dto);

    // 1. استعلام صحة الاشتراك وحصص الاستخدام (Subscription & Quotas)
    const subscriptionPromise = this.prisma.centerSubscription.findFirst({
      where: { centerId, status: { in: ['ACTIVE', 'EXPIRED'] } },
      include: { subscriptionPlan: true },
      orderBy: { endDate: 'desc' },
    });

    // 2. العمليات التشغيلية (Operational Stats)
    const totalStudentsPromise = this.prisma.student.count({
      where: { centerId },
    });
    const activeStudentsPromise = this.prisma.student.count({
      where: { centerId, user: { isActive: true } },
    });
    const totalTeachersPromise = this.prisma.teacher.count({
      where: { centerId },
    });
    const totalGroupsPromise = this.prisma.group.count({ where: { centerId } });
    const activeGroupsPromise = this.prisma.group.count({
      where: { centerId, isActive: true },
    });
    const totalSubjectsPromise = this.prisma.subject.count({
      where: { centerId },
    });
    const totalGradesPromise = this.prisma.grade.count({ where: { centerId } });

    // 3. المعاملات المالية خلال الفترة (Financial Metrics)
    const dateFilterTx: Prisma.PaymentTransactionWhereInput = { centerId };
    const dateFilterRefund: Prisma.PaymentRefundWhereInput = { centerId };
    const dateFilterEarning: Prisma.TeacherEarningEntryWhereInput = {
      centerId,
    };
    const dateFilterAllocation: Prisma.PaymentAllocationWhereInput = {
      centerId,
    };
    const dateFilterSettlement: Prisma.TeacherSettlementWhereInput = {
      centerId,
    };

    if (from || to) {
      dateFilterTx.paymentDate = {};
      dateFilterRefund.createdAt = {};
      dateFilterEarning.entryDate = {};
      dateFilterAllocation.createdAt = {};
      dateFilterSettlement.settlementDate = {};

      if (from) {
        dateFilterTx.paymentDate.gte = from;
        dateFilterRefund.createdAt.gte = from;
        dateFilterEarning.entryDate.gte = from;
        dateFilterAllocation.createdAt.gte = from;
        dateFilterSettlement.settlementDate.gte = from;
      }
      if (to) {
        dateFilterTx.paymentDate.lte = to;
        dateFilterRefund.createdAt.lte = to;
        dateFilterEarning.entryDate.lte = to;
        dateFilterAllocation.createdAt.lte = to;
        dateFilterSettlement.settlementDate.lte = to;
      }
    }

    const txsPromise = this.prisma.paymentTransaction.findMany({
      where: dateFilterTx,
      select: { amount: true, unallocatedAmount: true, refundedAmount: true },
    });

    const refundsPromise = this.prisma.paymentRefund.findMany({
      where: dateFilterRefund,
      select: {
        amount: true,
        teacherRefundShare: true,
        centerRefundShare: true,
      },
    });

    const earningsPromise = this.prisma.teacherEarningEntry.findMany({
      where: dateFilterEarning,
      select: { type: true, amount: true },
    });

    const allocationsPromise = this.prisma.paymentAllocation.findMany({
      where: dateFilterAllocation,
      select: { centerAmount: true, teacherAmount: true },
    });

    const settlementsInPeriodPromise = this.prisma.teacherSettlement.findMany({
      where: dateFilterSettlement,
      select: { status: true, amount: true },
    });

    // 4. الأرصدة التراكمية المركزية للسنتر (Cumulative Liabilities & Receivables)
    const allPendingSettlementsPromise = this.prisma.teacherSettlement.findMany(
      {
        where: { centerId, status: SettlementStatus.PENDING },
        select: { amount: true },
      },
    );

    const allUnpaidObligationsPromise =
      this.prisma.studentFeeObligation.findMany({
        where: {
          centerId,
          status: {
            in: [ObligationStatus.UNPAID, ObligationStatus.PARTIALLY_PAID],
          },
          isWaived: false,
        },
        select: { remainingAmount: true },
      });

    const allUnallocatedTxPromise = this.prisma.paymentTransaction.findMany({
      where: {
        centerId,
        unallocatedAmount: { gt: 0 },
      },
      select: { unallocatedAmount: true },
    });

    const allTeacherEarningsPromise = this.prisma.teacherEarningEntry.findMany({
      where: { centerId },
      select: { type: true, amount: true },
    });

    const allCompletedSettlementsPromise =
      this.prisma.teacherSettlement.findMany({
        where: { centerId, status: SettlementStatus.COMPLETED },
        select: { amount: true },
      });

    // 5. النشاطات الأخيرة (Recent Streams)
    const recentPaymentsPromise = this.prisma.paymentTransaction.findMany({
      where: { centerId },
      orderBy: { paymentDate: 'desc' },
      take: 5,
      include: {
        student: {
          select: { user: { select: { fullName: true, phone: true } } },
        },
      },
    });

    const recentSettlementsPromise = this.prisma.teacherSettlement.findMany({
      where: { centerId },
      orderBy: { settlementDate: 'desc' },
      take: 5,
      include: {
        teacher: {
          select: { user: { select: { fullName: true, phone: true } } },
        },
      },
    });

    const recentStudentsPromise = this.prisma.student.findMany({
      where: { centerId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        user: { select: { fullName: true, phone: true, email: true } },
      },
    });

    const recentTeachersPromise = this.prisma.teacher.findMany({
      where: { centerId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        user: { select: { fullName: true, phone: true, email: true } },
      },
    });

    // تنفيذ جميع الاستعلامات بالتوازي بأعلى أداء
    const [
      subscription,
      totalStudents,
      activeStudents,
      totalTeachers,
      totalGroups,
      activeGroups,
      totalSubjects,
      totalGrades,
      txsInPeriod,
      refundsInPeriod,
      earningsInPeriod,
      allocationsInPeriod,
      settlementsInPeriod,
      allPendingSettlements,
      allUnpaidObligations,
      allUnallocatedTxs,
      allTeacherEarnings,
      allCompletedSettlements,
      recentPayments,
      recentSettlements,
      recentStudents,
      recentTeachers,
    ] = await Promise.all([
      subscriptionPromise,
      totalStudentsPromise,
      activeStudentsPromise,
      totalTeachersPromise,
      totalGroupsPromise,
      activeGroupsPromise,
      totalSubjectsPromise,
      totalGradesPromise,
      txsPromise,
      refundsPromise,
      earningsPromise,
      allocationsPromise,
      settlementsInPeriodPromise,
      allPendingSettlementsPromise,
      allUnpaidObligationsPromise,
      allUnallocatedTxPromise,
      allTeacherEarningsPromise,
      allCompletedSettlementsPromise,
      recentPaymentsPromise,
      recentSettlementsPromise,
      recentStudentsPromise,
      recentTeachersPromise,
    ]);

    // معالجة الاشتراك والمهلة
    let subscriptionHealth: any = null;
    if (subscription) {
      const now = new Date();
      const endDate = new Date(subscription.endDate);
      endDate.setHours(23, 59, 59, 999);
      const gracePeriodEnd = new Date(
        endDate.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000,
      );

      const isGracePeriod = now > endDate && now <= gracePeriodEnd;
      const isExpired = now > gracePeriodEnd;
      const remainingDays = Math.ceil(
        (endDate.getTime() - now.getTime()) / (1000 * 3600 * 24),
      );
      const remainingGraceDays = isGracePeriod
        ? Math.max(
            1,
            Math.ceil(
              (gracePeriodEnd.getTime() - now.getTime()) / (1000 * 3600 * 24),
            ),
          )
        : 0;

      let statusString = 'ACTIVE';
      if (isGracePeriod) statusString = 'GRACE_PERIOD';
      else if (isExpired) statusString = 'EXPIRED';

      const studentLimit = subscription.subscriptionPlan.studentLimit;
      const teacherLimit = subscription.subscriptionPlan.teacherLimit;

      subscriptionHealth = {
        planName: subscription.subscriptionPlan.name,
        planType: subscription.subscriptionPlan.type,
        status: statusString,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        daysRemaining: remainingDays,
        isGracePeriod,
        remainingGraceDays,
        canCreateExams: subscription.subscriptionPlan.canCreateExams,
        studentQuota: {
          current: totalStudents,
          limit: studentLimit,
          usagePercent: Math.min(
            100,
            Math.round((totalStudents / studentLimit) * 100),
          ),
        },
        teacherQuota: {
          current: totalTeachers,
          limit: teacherLimit,
          usagePercent: Math.min(
            100,
            Math.round((totalTeachers / teacherLimit) * 100),
          ),
        },
      };
    }

    // احتساب القيم المالية للفترة المحددة
    let collectedRevenue = new Prisma.Decimal(0);
    for (const tx of txsInPeriod) {
      collectedRevenue = collectedRevenue.plus(tx.amount);
    }

    let totalRefunds = new Prisma.Decimal(0);
    let teacherRefundsShare = new Prisma.Decimal(0);
    let centerRefundsShare = new Prisma.Decimal(0);
    for (const ref of refundsInPeriod) {
      totalRefunds = totalRefunds.plus(ref.amount);
      teacherRefundsShare = teacherRefundsShare.plus(ref.teacherRefundShare);
      centerRefundsShare = centerRefundsShare.plus(ref.centerRefundShare);
    }

    const netCollectedRevenue = collectedRevenue.minus(totalRefunds);

    let teacherGrossEarnings = new Prisma.Decimal(0);
    let teacherRefundAdjustments = new Prisma.Decimal(0);
    for (const e of earningsInPeriod) {
      if (e.type === TeacherEarningType.EARNING) {
        teacherGrossEarnings = teacherGrossEarnings.plus(e.amount);
      } else if (e.type === TeacherEarningType.REFUND_ADJUSTMENT) {
        teacherRefundAdjustments = teacherRefundAdjustments.plus(e.amount);
      }
    }
    const teacherNetEarnings = teacherGrossEarnings.minus(
      teacherRefundAdjustments,
    );

    let centerAllocatedGross = new Prisma.Decimal(0);
    for (const a of allocationsInPeriod) {
      centerAllocatedGross = centerAllocatedGross.plus(a.centerAmount);
    }
    const centerGrossShare = centerAllocatedGross.minus(centerRefundsShare);

    let settledPayoutsInPeriod = new Prisma.Decimal(0);
    for (const s of settlementsInPeriod) {
      if (s.status === SettlementStatus.COMPLETED) {
        settledPayoutsInPeriod = settledPayoutsInPeriod.plus(s.amount);
      }
    }

    // احتساب الأرصدة التراكمية الدائمة (Center Outstanding Liabilities & Receivables)
    let currentPendingReserve = new Prisma.Decimal(0);
    for (const p of allPendingSettlements) {
      currentPendingReserve = currentPendingReserve.plus(p.amount);
    }

    let outstandingStudentReceivables = new Prisma.Decimal(0);
    for (const ob of allUnpaidObligations) {
      outstandingStudentReceivables = outstandingStudentReceivables.plus(
        ob.remainingAmount,
      );
    }

    let studentCreditBalances = new Prisma.Decimal(0);
    for (const ut of allUnallocatedTxs) {
      studentCreditBalances = studentCreditBalances.plus(ut.unallocatedAmount);
    }

    // إجمالي مستحقات المعلمين التراكمية غير المصروفة
    let allTimeTeacherEarnings = new Prisma.Decimal(0);
    for (const te of allTeacherEarnings) {
      if (te.type === TeacherEarningType.EARNING) {
        allTimeTeacherEarnings = allTimeTeacherEarnings.plus(te.amount);
      } else if (te.type === TeacherEarningType.REFUND_ADJUSTMENT) {
        allTimeTeacherEarnings = allTimeTeacherEarnings.minus(te.amount);
      }
    }

    let allTimeSettled = new Prisma.Decimal(0);
    for (const cs of allCompletedSettlements) {
      allTimeSettled = allTimeSettled.plus(cs.amount);
    }

    const outstandingTeacherLiabilities =
      allTimeTeacherEarnings.minus(allTimeSettled);

    return {
      period: dto.period || DashboardPeriod.MONTH,
      dateRange: { from, to },
      subscriptionHealth,
      operationalStats: {
        totalStudents,
        activeStudents,
        totalTeachers,
        totalGroups,
        activeGroups,
        totalSubjects,
        totalGrades,
      },
      financialMetrics: {
        collectedRevenue: Number(collectedRevenue.toFixed(2)),
        totalRefunds: Number(totalRefunds.toFixed(2)),
        netCollectedRevenue: Number(netCollectedRevenue.toFixed(2)),
        teacherGrossEarnings: Number(teacherGrossEarnings.toFixed(2)),
        teacherNetEarnings: Number(teacherNetEarnings.toFixed(2)),
        centerGrossShare: Number(centerGrossShare.toFixed(2)),
        settledPayouts: Number(settledPayoutsInPeriod.toFixed(2)),
        currentPendingReserve: Number(currentPendingReserve.toFixed(2)),
        outstandingTeacherLiabilities: Number(
          outstandingTeacherLiabilities.toFixed(2),
        ),
        outstandingStudentReceivables: Number(
          outstandingStudentReceivables.toFixed(2),
        ),
        studentCreditBalances: Number(studentCreditBalances.toFixed(2)),
      },
      recentActivity: {
        payments: recentPayments.map((p) => ({
          id: p.id,
          receiptNumber: p.receiptNumber,
          studentName: p.student.user.fullName,
          studentPhone: p.student.user.phone,
          amount: Number(p.amount.toFixed(2)),
          paymentMethod: p.paymentMethod,
          paymentDate: p.paymentDate,
        })),
        settlements: recentSettlements.map((s) => ({
          id: s.id,
          settlementNumber: s.settlementNumber,
          teacherName: s.teacher.user.fullName,
          teacherPhone: s.teacher.user.phone,
          amount: Number(s.amount.toFixed(2)),
          status: s.status,
          settlementDate: s.settlementDate,
        })),
        students: recentStudents.map((st) => ({
          id: st.id,
          name: st.user.fullName,
          phone: st.user.phone,
          createdAt: st.createdAt,
        })),
        teachers: recentTeachers.map((tc) => ({
          id: tc.id,
          name: tc.user.fullName,
          phone: tc.user.phone,
          createdAt: tc.createdAt,
        })),
      },
    };
  }
}
