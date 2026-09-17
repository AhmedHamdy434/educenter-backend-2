import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { SubscriptionPlan } from '@prisma/client';
import { GRACE_PERIOD_DAYS } from 'src/common/constants';

export interface SubscriptionValidationResult {
  subscriptionPlan: SubscriptionPlan;
  isGracePeriod: boolean;
  isExpired: boolean;
  remainingGraceDays?: number;
  warningHeader?: string;
}

@Injectable()
export class SubscriptionValidationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Validate center subscription access considering the 3-day grace period and read-only mode.
   * - <= endDate: Active (Read + Write allowed)
   * - > endDate and <= endDate + 3 days: Grace Period (Read + Write allowed with X-Subscription-Warning header)
   * - > endDate + 3 days: Expired (GET/HEAD/OPTIONS allowed in Read-Only mode, Writes rejected with 403)
   */
  async validateSubscriptionAccess(
    centerId: string,
    isReadOnly: boolean = false,
  ): Promise<SubscriptionValidationResult> {
    const subscription = await this.prisma.centerSubscription.findFirst({
      where: {
        centerId,
        status: { in: ['ACTIVE', 'EXPIRED'] },
      },
      include: {
        subscriptionPlan: true,
      },
      orderBy: {
        endDate: 'desc',
      },
    });

    if (!subscription) {
      throw new ForbiddenException(
        'المركز لا يمتلك اشتراكاً نشطاً حالياً. يرجى الاشتراك في إحدى الباقات.',
      );
    }

    const now = new Date();
    const endDate = new Date(subscription.endDate);
    endDate.setHours(23, 59, 59, 999);
    const gracePeriodEnd = new Date(
      endDate.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000,
    );

    // Case 1: Subscription is active
    if (now <= endDate) {
      return {
        subscriptionPlan: subscription.subscriptionPlan,
        isGracePeriod: false,
        isExpired: false,
      };
    }

    // Case 2: Within 3-day grace period
    if (now <= gracePeriodEnd) {
      const remainingMs = gracePeriodEnd.getTime() - now.getTime();
      const remainingDays = Math.max(
        1,
        Math.ceil(remainingMs / (24 * 60 * 60 * 1000)),
      );
      const warningHeader = `فترة السماح نشطة. ${remainingDays} أيام متبقية.`;

      return {
        subscriptionPlan: subscription.subscriptionPlan,
        isGracePeriod: true,
        isExpired: false,
        remainingGraceDays: remainingDays,
        warningHeader,
      };
    }

    // Case 3: Past grace period (Expired)
    if (isReadOnly) {
      return {
        subscriptionPlan: subscription.subscriptionPlan,
        isGracePeriod: false,
        isExpired: true,
        warningHeader:
          'الاشتراك منتهي، يرجى التجديد لاستكمال الإضافة والتعديل.',
      };
    }

    throw new ForbiddenException(
      'اشتراك السنتر منتهي، برجاء التجديد لاستكمال الإضافة والتعديل.',
    );
  }

  /**
   * Get the active subscription of the center and validate if it is currently active or within grace period.
   * Pure read-only check (no DB writes). Status mutations to EXPIRED are handled exclusively by the midnight cron.
   */
  async validateActiveSubscription(centerId: string) {
    const result = await this.validateSubscriptionAccess(centerId, false);
    return result.subscriptionPlan;
  }

  /**
   * Backward-compatible alias for validateActiveSubscription.
   */
  async getActiveSubscription(centerId: string) {
    return this.validateActiveSubscription(centerId);
  }

  /**
   * Validate student limit for a center.
   */
  async validateStudentLimit(centerId: string) {
    const plan = await this.getActiveSubscription(centerId);

    const count = await this.prisma.student.count({
      where: {
        centerId,
      },
    });

    if (count >= plan.studentLimit) {
      throw new BadRequestException(
        `تم تجاوز الحد الأقصى المسموح به للطلاب في باقتك الحالية (${plan.studentLimit} طالب). يرجى ترقية الاشتراك.`,
      );
    }
  }

  /**
   * Validate teacher limit for a center.
   */
  async validateTeacherLimit(centerId: string) {
    const plan = await this.getActiveSubscription(centerId);

    const count = await this.prisma.teacher.count({
      where: {
        centerId,
      },
    });

    if (count >= plan.teacherLimit) {
      throw new BadRequestException(
        `تم تجاوز الحد الأقصى المسموح به للمعلمين في باقتك الحالية (${plan.teacherLimit} معلم). يرجى ترقية الاشتراك.`,
      );
    }
  }

  /**
   * Validate exam creation permission.
   */
  async validateExamCreation(centerId: string) {
    const plan = await this.getActiveSubscription(centerId);

    if (!plan.canCreateExams) {
      throw new ForbiddenException(
        'باقتك الحالية لا تدعم إنشاء الاختبارات. يرجى الترقية لتفعيل هذه الميزة.',
      );
    }
  }
}
