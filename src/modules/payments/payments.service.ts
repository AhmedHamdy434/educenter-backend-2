import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AppRole } from '../../common/enums/app-role.enum';
import { PayMonthDto } from './dto/pay-month.dto';

import { ExcelService } from '../../shared/excel/excel.service';
import {
  groupPaymentExcelSelect,
  payMonthGroupStudentSelect,
  studentPaymentSelect,
} from './constants/payment.select';
import {
  StudentPaymentItem,
  GroupPaymentStudentItem,
  GroupPaymentStats,
  StudentPaymentMonthItem,
  StudentPaymentHistoryItem,
  StudentPaymentsTotals,
  StudentPaymentsSummaryData,
  PayMonthResponse,
} from './interfaces/payment.interface';
import { GetGroupPaymentsQueryDto } from './dto/get-group-payments.dto';
import { buildMeta, PaginationMeta } from '../../common/utils/buildMeta';
import { MonthlyPayment, Prisma } from '@prisma/client';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly excelService: ExcelService,
  ) {}

  /**
   * تحويل أي تاريخ إلى اليوم الأول من الشهر في التوقيت العالمي (UTC midnight) لتسهيل المقارنة.
   */
  private normalizeToFirstOfMonth(input: string | Date): Date {
    let year: number;
    let month: number;

    if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}/.test(input)) {
      const parts = input.split('-');
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10) - 1; // 0-based month
    } else {
      const dateObj = new Date(input);
      if (isNaN(dateObj.getTime())) {
        throw new BadRequestException('التاريخ المدخل غير صالح.');
      }
      year = dateObj.getUTCFullYear();
      month = dateObj.getUTCMonth();
    }

    return new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  }

  /**
   * تنسيق التاريخ ليكون بصيغة YYYY-MM-DD
   */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * توليد قائمة التواريخ الشهرية للمجموعة بناءً على تاريخ البداية وعدد الأشهر.
   */
  private getGroupMonths(startDate: Date, monthsCount: number): Date[] {
    const months: Date[] = [];
    const normalizedStart = this.normalizeToFirstOfMonth(startDate);
    for (let i = 0; i < monthsCount; i++) {
      const d = new Date(
        Date.UTC(
          normalizedStart.getUTCFullYear(),
          normalizedStart.getUTCMonth() + i,
          1,
          0,
          0,
          0,
          0,
        ),
      );
      months.push(d);
    }
    return months;
  }

  /**
   * Helper مركزي للتحقق من وجود الطالب في المركز والتحقق من صلاحيات الوصول حسب الدور (OWNER / TEACHER / STUDENT).
   */
  private async resolveStudentWithAccessCheck(
    centerId: string,
    studentId: string,
    userRole: AppRole,
    userId: string,
  ): Promise<{
    resolvedStudentId: string;
    student: Prisma.StudentGetPayload<{ include: { user: true } }>;
  }> {
    let resolvedStudentId = studentId;

    if (studentId === 'me') {
      const currentStudent = await this.prisma.student.findUnique({
        where: { userId },
      });
      if (!currentStudent) {
        throw new NotFoundException('حساب الطالب المطلوب غير موجود.');
      }
      resolvedStudentId = currentStudent.id;
    }

    const student = await this.prisma.student.findUnique({
      where: { id: resolvedStudentId },
      include: {
        user: true,
      },
    });

    if (!student || student.user.centerId !== centerId) {
      throw new NotFoundException('الطالب المطلوب غير موجود في هذا المركز.');
    }

    // التحقق من الصلاحيات الإضافية
    if (userRole === AppRole.STUDENT) {
      if (student.userId !== userId) {
        throw new ForbiddenException('ليس لديك صلاحية لعرض مدفوعات طالب آخر.');
      }
    } else if (userRole === AppRole.TEACHER) {
      const teacher = await this.prisma.teacher.findUnique({
        where: { userId },
        select: { id: true },
      });
      if (!teacher) {
        throw new NotFoundException('حساب المعلم الحالي غير موجود.');
      }

      // التحقق من أن الطالب مسجل في إحدى مجموعات هذا المعلم
      const isTeached = await this.prisma.groupStudent.findFirst({
        where: {
          studentId: resolvedStudentId,
          group: {
            teacherId: teacher.id,
            centerId,
          },
        },
      });

      if (!isTeached) {
        throw new ForbiddenException(
          'ليس لديك صلاحية لعرض مدفوعات هذا الطالب.',
        );
      }
    }

    return { resolvedStudentId, student };
  }

  /**
   * Helper مشترك لحساب حالة الالتزام المالي والمبالغ المستحقة والمدفوعة لشهر معين.
   */
  private resolveMonthFeeStatus(
    monthStr: string,
    monthlyFeeDecimal: Prisma.Decimal,
    obligation?: {
      finalAmountDue: Prisma.Decimal | number;
      paidAmount: Prisma.Decimal | number;
      remainingAmount: Prisma.Decimal | number;
      status: string;
      isWaived?: boolean;
    } | null,
    legacyPayment?: {
      amount: Prisma.Decimal | number;
    } | null,
  ): StudentPaymentMonthItem {
    if (monthlyFeeDecimal.lte(0)) {
      return {
        month: monthStr,
        amountDue: 0,
        paidAmount: 0,
        remainingAmount: 0,
        status: 'PAID',
        isWaived: false,
      };
    }

    if (obligation) {
      const amountDue = new Prisma.Decimal(obligation.finalAmountDue)
        .toDecimalPlaces(2)
        .toNumber();
      const paidAmount = new Prisma.Decimal(obligation.paidAmount)
        .toDecimalPlaces(2)
        .toNumber();
      const remainingAmount = new Prisma.Decimal(obligation.remainingAmount)
        .toDecimalPlaces(2)
        .toNumber();
      return {
        month: monthStr,
        amountDue,
        paidAmount,
        remainingAmount,
        status: obligation.status as 'UNPAID' | 'PARTIALLY_PAID' | 'PAID',
        isWaived: Boolean(obligation.isWaived),
      };
    }

    if (legacyPayment) {
      const paidDecimal = new Prisma.Decimal(legacyPayment.amount);
      const paidAmount = paidDecimal.toDecimalPlaces(2).toNumber();
      const amountDue = monthlyFeeDecimal.toDecimalPlaces(2).toNumber();
      const remainingDecimal = Prisma.Decimal.max(
        0,
        monthlyFeeDecimal.sub(paidDecimal),
      );
      const remainingAmount = remainingDecimal.toDecimalPlaces(2).toNumber();
      const status: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' =
        remainingAmount === 0
          ? 'PAID'
          : paidAmount > 0
            ? 'PARTIALLY_PAID'
            : 'UNPAID';
      return {
        month: monthStr,
        amountDue,
        paidAmount,
        remainingAmount,
        status,
        isWaived: false,
      };
    }

    const amountDue = monthlyFeeDecimal.toDecimalPlaces(2).toNumber();
    return {
      month: monthStr,
      amountDue,
      paidAmount: 0,
      remainingAmount: amountDue,
      status: 'UNPAID',
      isWaived: false,
    };
  }

  /**
   * جلب تفاصيل مدفوعات طلاب مجموعة معينة مع pagination والبحث وبحث الشهور.
   */
  async getGroupPayments(
    centerId: string,
    groupId: string,
    query?: GetGroupPaymentsQueryDto,
  ): Promise<{
    data: GroupPaymentStudentItem[];
    meta: PaginationMeta;
    stats: GroupPaymentStats;
  }> {
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, centerId },
      select: {
        id: true,
        startDate: true,
        monthsCount: true,
        monthlyFee: true,
      },
    });

    if (!group) {
      throw new NotFoundException('المجموعة الدراسية المطلوبة غير موجودة.');
    }

    const groupMonths = this.getGroupMonths(group.startDate, group.monthsCount);
    const groupMonthsFormatted = groupMonths.map((m) => this.formatDate(m));
    const monthlyFee = Number(group.monthlyFee);

    // بناء فلتر البحث
    const where: Prisma.GroupStudentWhereInput = {
      groupId,
      centerId,
    };

    if (query?.search) {
      const search = query.search.trim();
      where.student = {
        OR: [
          { code: { contains: search, mode: 'insensitive' } },
          { parentPhone: { contains: search } },
          {
            user: {
              OR: [
                { fullName: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search } },
                { email: { contains: search, mode: 'insensitive' } },
              ],
            },
          },
        ],
      };
    }

    // تحديد الشهر المستهدف: إما المُمرر في query أو الشهر الحالي (إن كان ضمن شهور المجموعة) أو أول شهر للمجموعة
    let targetMonthForStats: string;
    if (query?.month) {
      targetMonthForStats = this.formatDate(
        this.normalizeToFirstOfMonth(query.month),
      );
    } else {
      const today = new Date();
      const currentMonthStr = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-01`;
      targetMonthForStats = groupMonthsFormatted.includes(currentMonthStr)
        ? currentMonthStr
        : groupMonthsFormatted[0] || currentMonthStr;
    }

    // فلترة الشهر للجدول والـ count:
    // نعرض الطلاب الذين انضموا قبل أو في نهاية الشهر المستهدف (أي يستحق عليهم هذا الشهر أو قبله)
    if (targetMonthForStats) {
      const targetMonthDate = this.normalizeToFirstOfMonth(targetMonthForStats);
      const nextMonth = new Date(
        Date.UTC(
          targetMonthDate.getUTCFullYear(),
          targetMonthDate.getUTCMonth() + 1,
          1,
          0,
          0,
          0,
          0,
        ),
      );

      where.subscriptionStartDate = {
        lt: nextMonth,
      };
    }

    const total = await this.prisma.groupStudent.count({ where });

    // ─── حساب الإحصائيات على كل طلاب المجموعة (بدون pagination) ───
    const allStudentsForStats = await this.prisma.groupStudent.findMany({
      where: { groupId, centerId },
      select: {
        subscriptionStartDate: true,
        payments: {
          select: {
            subscriptionDate: true,
            amount: true,
          },
        },
      },
    });

    let statsPaid = 0;
    let statsUnpaid = 0;
    let statsExpectedDecimal = new Prisma.Decimal(0);
    let statsCollectedDecimal = new Prisma.Decimal(0);

    let targetRequiredStudentsCount = 0;
    const currentMonthlyFeeDecimal = new Prisma.Decimal(group.monthlyFee);

    for (const gs of allStudentsForStats) {
      const studentStart = this.normalizeToFirstOfMonth(
        gs.subscriptionStartDate,
      );
      const reqMonths = groupMonths
        .filter((m) => m.getTime() >= studentStart.getTime())
        .map((m) => this.formatDate(m));

      if (targetMonthForStats) {
        // إحصائيات للشهر المُفلتر فقط
        const isRequired = reqMonths.includes(targetMonthForStats);
        if (isRequired) {
          targetRequiredStudentsCount++;
          const payment = gs.payments.find(
            (p) => this.formatDate(p.subscriptionDate) === targetMonthForStats,
          );
          if (payment) {
            statsPaid++;
            const paymentAmount = new Prisma.Decimal(payment.amount);
            statsCollectedDecimal = statsCollectedDecimal.plus(paymentAmount);
            // الشهور المسددة مسبقاً: المتوقع يطابق المحصل الفعلي لتجنب إظهار عجز وهمي عند تغير تسعيرة المجموعة
            statsExpectedDecimal = statsExpectedDecimal.plus(paymentAmount);
          } else {
            statsUnpaid++;
            statsExpectedDecimal = statsExpectedDecimal.plus(
              currentMonthlyFeeDecimal,
            );
          }
        }
      } else {
        // إحصائيات إجمالية لكل الأشهر
        for (const rm of reqMonths) {
          const p = gs.payments.find(
            (pay) => this.formatDate(pay.subscriptionDate) === rm,
          );
          if (p) {
            statsPaid++;
            const paymentAmount = new Prisma.Decimal(p.amount);
            statsCollectedDecimal = statsCollectedDecimal.plus(paymentAmount);
            statsExpectedDecimal = statsExpectedDecimal.plus(paymentAmount);
          } else {
            statsUnpaid++;
            statsExpectedDecimal = statsExpectedDecimal.plus(
              currentMonthlyFeeDecimal,
            );
          }
        }
      }
    }

    const stats: GroupPaymentStats = {
      activeMonth: targetMonthForStats,
      total: targetMonthForStats
        ? targetRequiredStudentsCount
        : allStudentsForStats.length,
      paid: statsPaid,
      unpaid: statsUnpaid,
      expected: statsExpectedDecimal.toNumber(),
      collected: statsCollectedDecimal.toNumber(),
      groupMonths: groupMonthsFormatted,
    };
    // ─────────────────────────────────────────────────────────────────

    // ترتيب الطلاب
    let orderBy:
      | Prisma.GroupStudentOrderByWithRelationInput
      | Prisma.GroupStudentOrderByWithRelationInput[] = [{ joinedAt: 'desc' }];

    if (query?.sortBy === 'name') {
      orderBy = {
        student: {
          user: {
            fullName: query.sortOrder || 'asc',
          },
        },
      };
    } else if (query?.sortBy === 'subscriptionStartDate') {
      orderBy = { subscriptionStartDate: query.sortOrder || 'desc' };
    } else if (query?.sortBy === 'joinedAt') {
      orderBy = { joinedAt: query.sortOrder || 'desc' };
    }

    const students = await this.prisma.groupStudent.findMany({
      where,
      skip: query?.skip,
      take: query?.take,
      orderBy,
      select: {
        id: true,
        studentId: true,
        subscriptionStartDate: true,
        payments: {
          select: {
            id: true,
            subscriptionDate: true,
            amount: true,
            paidAt: true,
            notes: true,
          },
          orderBy: { subscriptionDate: 'asc' },
        },
        feeObligations: {
          select: {
            id: true,
            periodDate: true,
            amountDue: true,
            finalAmountDue: true,
            paidAmount: true,
            remainingAmount: true,
            status: true,
          },
        },
        student: {
          select: {
            id: true,
            code: true,
            user: {
              select: {
                fullName: true,
                email: true,
                phone: true,
                avatar: true,
              },
            },
          },
        },
      },
    });

    const studentsData: GroupPaymentStudentItem[] = students.map((gs) => {
      const studentStart = this.normalizeToFirstOfMonth(
        gs.subscriptionStartDate,
      );

      const requiredMonths = groupMonths
        .filter((m) => m.getTime() >= studentStart.getTime())
        .map((m) => this.formatDate(m));

      const paidMonths = gs.payments.map((p) => ({
        id: p.id,
        subscriptionDate: this.formatDate(p.subscriptionDate),
        amount: Number(p.amount),
        paidAt: p.paidAt,
        notes: p.notes,
      }));

      const paidDatesSet = new Set(paidMonths.map((pm) => pm.subscriptionDate));
      const unpaidMonths = requiredMonths.filter((rm) => !paidDatesSet.has(rm));

      const isCurrentMonthRequired =
        requiredMonths.includes(targetMonthForStats);
      const currentMonthPayment =
        gs.payments.find(
          (p) => this.formatDate(p.subscriptionDate) === targetMonthForStats,
        ) || null;

      const targetObligation = gs.feeObligations.find(
        (o) => this.formatDate(o.periodDate) === targetMonthForStats,
      );

      const feeStatus = this.resolveMonthFeeStatus(
        targetMonthForStats,
        new Prisma.Decimal(monthlyFee),
        targetObligation,
        currentMonthPayment,
      );

      const currentMonth = {
        month: targetMonthForStats,
        isRequired: isCurrentMonthRequired,
        isPaid: feeStatus.status === 'PAID',
        status: feeStatus.status,
        amountDue: feeStatus.amountDue,
        paidAmount: feeStatus.paidAmount,
        remainingAmount: feeStatus.remainingAmount,
        payment: currentMonthPayment
          ? {
              id: currentMonthPayment.id,
              amount: Number(currentMonthPayment.amount),
              paidAt: currentMonthPayment.paidAt,
              notes: currentMonthPayment.notes,
            }
          : null,
      };

      return {
        groupStudentId: gs.id,
        studentId: gs.studentId,
        studentInfo: {
          fullName: gs.student.user.fullName,
          code: gs.student.code,
          email: gs.student.user.email,
          phone: gs.student.user.phone,
          avatar: gs.student.user.avatar,
        },
        subscriptionStartDate: this.formatDate(gs.subscriptionStartDate),
        monthlyFee,
        currentMonth,
        requiredMonths,
        paidMonths,
        unpaidMonths,
      };
    });

    const page = query?.page ?? 1;
    const limit = query?.limit ?? 10;
    const meta = buildMeta(total, page, limit);

    return { data: studentsData, meta, stats };
  }

  /**
   * دفع اشتراك شهر معين لطالب في مجموعة (يدعم السداد الكلي أو الجزئي مع تسجيل حركات التحصيل ومستحقات المعلم).
   */
  async payMonth(
    centerId: string,
    groupStudentId: string,
    dto: PayMonthDto,
  ): Promise<PayMonthResponse> {
    const groupStudent = await this.prisma.groupStudent.findUnique({
      where: { id: groupStudentId },
      select: payMonthGroupStudentSelect,
    });

    if (!groupStudent || groupStudent.group.centerId !== centerId) {
      throw new NotFoundException(
        'علاقة الطالب بالمجموعة غير موجودة في هذا المركز.',
      );
    }

    // التحقق من المجموعات المجانية
    const monthlyFeeDecimal = new Prisma.Decimal(groupStudent.group.monthlyFee);
    if (monthlyFeeDecimal.lte(0)) {
      throw new BadRequestException(
        'هذه المجموعة مجانية ولا يوجد اشتراك مستحق.',
      );
    }

    const targetMonth = this.normalizeToFirstOfMonth(dto.subscriptionDate);

    // التحقق من صحة وقوع الشهر ضمن فترة اشتراك الطالب بالمجموعة
    const groupStart = this.normalizeToFirstOfMonth(
      groupStudent.group.startDate,
    );
    const studentStart = this.normalizeToFirstOfMonth(
      groupStudent.subscriptionStartDate,
    );

    // فترة اشتراك الطالب تبدأ من الحد الأقصى بين بداية المجموعة وبداية اشتراك الطالب
    const activeStart =
      studentStart.getTime() > groupStart.getTime() ? studentStart : groupStart;
    const groupEnd = new Date(
      Date.UTC(
        groupStart.getUTCFullYear(),
        groupStart.getUTCMonth() + groupStudent.group.monthsCount - 1,
        1,
        0,
        0,
        0,
        0,
      ),
    );

    if (
      targetMonth.getTime() < activeStart.getTime() ||
      targetMonth.getTime() > groupEnd.getTime()
    ) {
      throw new BadRequestException(
        `تاريخ الاشتراك المدخل خارج فترة اشتراك الطالب بالمجموعة (الفترة المتاحة: من ${this.formatDate(
          activeStart,
        )} إلى ${this.formatDate(groupEnd)}).`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. جلب إعدادات المركز لنسب التوزيع المالي
      let settings = await tx.centerSettings.findUnique({
        where: { centerId },
      });
      if (!settings) {
        settings = await tx.centerSettings.create({
          data: {
            centerId,
            centerSharePercentage: new Prisma.Decimal(20.0),
            teacherSharePercentage: new Prisma.Decimal(80.0),
            allowStudentCreditAdvance: true,
            currency: 'EGP',
          },
        });
      }

      // 2. جلب أو إنشاء الالتزام المالي للشهر المستهدف
      let obligation = await tx.studentFeeObligation.findUnique({
        where: {
          groupStudentId_periodDate: {
            groupStudentId,
            periodDate: targetMonth,
          },
        },
      });

      if (!obligation) {
        const existingLegacy = await tx.monthlyPayment.findUnique({
          where: {
            groupStudentId_subscriptionDate: {
              groupStudentId,
              subscriptionDate: targetMonth,
            },
          },
        });

        const legacyPaid = existingLegacy
          ? new Prisma.Decimal(existingLegacy.amount)
          : new Prisma.Decimal(0);
        const legacyRemaining = Prisma.Decimal.max(
          0,
          monthlyFeeDecimal.sub(legacyPaid),
        );
        const legacyStatus = legacyRemaining.lte(0)
          ? 'PAID'
          : legacyPaid.gt(0)
            ? 'PARTIALLY_PAID'
            : 'UNPAID';

        obligation = await tx.studentFeeObligation.create({
          data: {
            centerId,
            studentId: groupStudent.studentId,
            groupId: groupStudent.groupId,
            groupStudentId,
            teacherId: groupStudent.group.teacherId,
            type: 'MONTHLY_TUITION',
            periodDate: targetMonth,
            amountDue: monthlyFeeDecimal,
            discountAmount: new Prisma.Decimal(0),
            finalAmountDue: monthlyFeeDecimal,
            paidAmount: legacyPaid,
            remainingAmount: legacyRemaining,
            status: legacyStatus,
            lockedTeacherShareRate: settings.teacherSharePercentage,
            lockedCenterShareRate: settings.centerSharePercentage,
            isLegacy: Boolean(existingLegacy),
          },
        });
      }

      // فحص المجموعة المجانية بعد قراءة الالتزام
      if (
        monthlyFeeDecimal.lte(0) ||
        new Prisma.Decimal(obligation.finalAmountDue).lte(0)
      ) {
        throw new BadRequestException(
          'هذه المجموعة مجانية ولا يوجد اشتراك مستحق.',
        );
      }

      const remainingDecimal = new Prisma.Decimal(obligation.remainingAmount);
      if (remainingDecimal.lte(0) || obligation.status === 'PAID') {
        throw new ConflictException('تم سداد هذا الاشتراك بالكامل مسبقاً.');
      }

      // تحديد والتحقق من صحة المبلغ المدفوع
      const payAmount = new Prisma.Decimal(dto.amount);
      if (payAmount.lte(0)) {
        throw new BadRequestException(
          'المبلغ المدفوع يجب أن يكون أكبر من الصفر.',
        );
      }

      if (payAmount.gt(remainingDecimal)) {
        throw new BadRequestException(
          `المبلغ المدفوع (${payAmount.toDecimalPlaces(2).toNumber()} ج.م) أكبر من المبلغ المتبقي المستحق (${remainingDecimal.toDecimalPlaces(2).toNumber()} ج.م).`,
        );
      }

      // 3. تحديث الالتزام المالي
      const isFullPayment = Boolean(dto.markAsFullPayment);
      const newPaidAmount = new Prisma.Decimal(obligation.paidAmount).plus(
        payAmount,
      );

      let newRemainingAmount: Prisma.Decimal;
      let newFinalAmountDue = new Prisma.Decimal(obligation.finalAmountDue);
      let newDiscountAmount = new Prisma.Decimal(obligation.discountAmount);
      let newStatus: 'PAID' | 'PARTIALLY_PAID';

      if (isFullPayment) {
        // عند اختيار اعتبار الشهر مسدداً بالكامل (خصم وإعفاء من المتبقي):
        // تصفير المبلغ المتبقي، وتعديل المبلغ المطلوب النهائي والخصم ليتطابق مع إجمالي ما تم دفعه
        newRemainingAmount = new Prisma.Decimal(0);
        newFinalAmountDue = newPaidAmount;
        newDiscountAmount = Prisma.Decimal.max(
          0,
          new Prisma.Decimal(obligation.amountDue).sub(newPaidAmount),
        );
        newStatus = 'PAID';
      } else {
        newRemainingAmount = remainingDecimal.sub(payAmount);
        newStatus = newRemainingAmount.lte(0) ? 'PAID' : 'PARTIALLY_PAID';
      }

      await tx.studentFeeObligation.update({
        where: { id: obligation.id },
        data: {
          paidAmount: newPaidAmount,
          remainingAmount: newRemainingAmount,
          finalAmountDue: newFinalAmountDue,
          discountAmount: newDiscountAmount,
          status: newStatus,
        },
      });

      // 4. توليد رقم الإيصال ورقم القيد
      const txCount = await tx.paymentTransaction.count({
        where: { centerId },
      });
      const now = new Date();
      const yearStr = now.getUTCFullYear();
      const monthStr = String(now.getUTCMonth() + 1).padStart(2, '0');
      const receiptNumber = `REC-${yearStr}${monthStr}-${String(txCount + 1).padStart(5, '0')}`;

      const earningCount = await tx.teacherEarningEntry.count({
        where: { centerId },
      });
      const entryNumber = `TEE-${yearStr}${monthStr}-${String(earningCount + 1).padStart(6, '0')}`;

      // 5. إنشاء حركة التحصيل النقدية (PaymentTransaction)
      const paymentTx = await tx.paymentTransaction.create({
        data: {
          centerId,
          studentId: groupStudent.studentId,
          receiptNumber,
          amount: payAmount,
          allocatedAmount: payAmount,
          unallocatedAmount: new Prisma.Decimal(0),
          refundedAmount: new Prisma.Decimal(0),
          paymentMethod: dto.paymentMethod ?? 'CASH',
          paymentDate: now,
          notes: dto.notes,
        },
      });

      // 6. حساب حصة المعلم والمركز بالنسبة المثبتة على الالتزام
      const teacherAmount = payAmount
        .mul(obligation.lockedTeacherShareRate)
        .div(100)
        .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      const centerAmount = payAmount.sub(teacherAmount);

      // 7. إنشاء تخصيص الدفعة (PaymentAllocation)
      const allocation = await tx.paymentAllocation.create({
        data: {
          centerId,
          transactionId: paymentTx.id,
          obligationId: obligation.id,
          amount: payAmount,
          teacherShareRate: obligation.lockedTeacherShareRate,
          centerShareRate: obligation.lockedCenterShareRate,
          teacherAmount,
          centerAmount,
          refundedAmount: new Prisma.Decimal(0),
        },
      });

      // 8. تسجيل قيد مستحقات المعلم في الدفتر المحاسبي (TeacherEarningEntry - EARNING)
      await tx.teacherEarningEntry.create({
        data: {
          centerId,
          teacherId: obligation.teacherId,
          entryNumber,
          type: 'EARNING',
          amount: teacherAmount,
          sourceAllocationId: allocation.id,
          allocatedToSettlementAmount: new Prisma.Decimal(0),
          entryDate: now,
          notes: `دفعة اشتراك الطالب لشهر ${this.formatDate(targetMonth)}`,
        },
      });

      // 9. مزامنة MonthlyPayment للتوافق مع الأنظمة الحالية
      const existingMonthly = await tx.monthlyPayment.findUnique({
        where: {
          groupStudentId_subscriptionDate: {
            groupStudentId,
            subscriptionDate: targetMonth,
          },
        },
      });

      let monthlyPayment: MonthlyPayment;
      if (existingMonthly) {
        monthlyPayment = await tx.monthlyPayment.update({
          where: { id: existingMonthly.id },
          data: {
            amount: existingMonthly.amount.plus(payAmount),
            paidAt: now,
            notes: dto.notes ?? existingMonthly.notes,
          },
        });
      } else {
        monthlyPayment = await tx.monthlyPayment.create({
          data: {
            id: paymentTx.id,
            groupStudentId,
            centerId,
            subscriptionDate: targetMonth,
            amount: payAmount,
            paidAt: now,
            notes: dto.notes,
          },
        });
      }

      // 10. إرجاع النتيجة مع حقل month وحقل receiptNumber
      return {
        ...monthlyPayment,
        receiptNumber,
        transaction: paymentTx,
        allocation,
        obligation: {
          id: obligation.id,
          amountDue: newFinalAmountDue.toDecimalPlaces(2).toNumber(),
          paidAmount: newPaidAmount.toDecimalPlaces(2).toNumber(),
          remainingAmount: newRemainingAmount.toDecimalPlaces(2).toNumber(),
          status: newStatus,
        },
        month: {
          month: this.formatDate(targetMonth),
          amountDue: newFinalAmountDue.toDecimalPlaces(2).toNumber(),
          paidAmount: newPaidAmount.toDecimalPlaces(2).toNumber(),
          remainingAmount: newRemainingAmount.toDecimalPlaces(2).toNumber(),
          status: newStatus,
          isWaived: Boolean(obligation.isWaived),
        },
      };
    });
  }

  /**
   * جلب سجل مدفوعات طالب معين.
   */
  async getStudentPayments(
    centerId: string,
    studentId: string,
    userRole: AppRole,
    userId: string,
    groupId?: string,
  ): Promise<StudentPaymentItem[]> {
    const { resolvedStudentId } = await this.resolveStudentWithAccessCheck(
      centerId,
      studentId,
      userRole,
      userId,
    );

    return this.prisma.monthlyPayment.findMany({
      where: {
        centerId,
        groupStudent: {
          studentId: resolvedStudentId,
          ...(groupId ? { groupId } : {}),
        },
      },
      select: studentPaymentSelect,
      orderBy: {
        subscriptionDate: 'desc',
      },
    });
  }

  /**
   * جلب ملخص مدفوعات الطالب الشامل (بيانات المجموعة، الشهور وحالتها، السجل المالي، الإجماليات).
   */
  async getStudentPaymentsSummary(
    centerId: string,
    studentId: string,
    userRole: AppRole,
    userId: string,
    groupId?: string,
  ): Promise<StudentPaymentsSummaryData> {
    const { resolvedStudentId } = await this.resolveStudentWithAccessCheck(
      centerId,
      studentId,
      userRole,
      userId,
    );

    let groupRecord: {
      id: string;
      name: string;
      monthlyFee: Prisma.Decimal;
      startDate: Date;
      monthsCount: number;
      teacherId: string;
    } | null = null;

    if (groupId) {
      const foundGroup = await this.prisma.group.findFirst({
        where: { id: groupId, centerId },
        select: {
          id: true,
          name: true,
          monthlyFee: true,
          startDate: true,
          monthsCount: true,
          teacherId: true,
        },
      });

      if (!foundGroup) {
        throw new NotFoundException(
          'المجموعة الدراسية المطلوبة غير موجودة في هذا المركز.',
        );
      }

      if (userRole === AppRole.TEACHER) {
        const teacher = await this.prisma.teacher.findUnique({
          where: { userId },
          select: { id: true },
        });
        if (!teacher || foundGroup.teacherId !== teacher.id) {
          throw new ForbiddenException(
            'ليس لديك صلاحية للوصول إلى هذه المجموعة.',
          );
        }
      }

      groupRecord = foundGroup;
    }

    let groupStudent: {
      id: string;
      subscriptionStartDate: Date;
    } | null = null;

    if (groupRecord) {
      groupStudent = await this.prisma.groupStudent.findUnique({
        where: {
          groupId_studentId: {
            groupId: groupRecord.id,
            studentId: resolvedStudentId,
          },
        },
        select: {
          id: true,
          subscriptionStartDate: true,
        },
      });
    }

    let months: StudentPaymentMonthItem[] = [];
    let defaultMonth: string | null = null;

    if (groupRecord && groupStudent) {
      const groupMonths = this.getGroupMonths(
        groupRecord.startDate,
        groupRecord.monthsCount,
      );
      const groupStart = this.normalizeToFirstOfMonth(groupRecord.startDate);
      const studentStart = this.normalizeToFirstOfMonth(
        groupStudent.subscriptionStartDate,
      );
      const activeStart =
        studentStart.getTime() > groupStart.getTime()
          ? studentStart
          : groupStart;

      const requiredMonthDates = groupMonths.filter(
        (m) => m.getTime() >= activeStart.getTime(),
      );

      const [obligations, legacyPayments] = await Promise.all([
        this.prisma.studentFeeObligation.findMany({
          where: {
            groupStudentId: groupStudent.id,
            centerId,
          },
          select: {
            periodDate: true,
            finalAmountDue: true,
            paidAmount: true,
            remainingAmount: true,
            status: true,
            isWaived: true,
          },
        }),
        this.prisma.monthlyPayment.findMany({
          where: {
            groupStudentId: groupStudent.id,
            centerId,
          },
          select: {
            subscriptionDate: true,
            amount: true,
          },
        }),
      ]);

      const obligationsMap = new Map(
        obligations.map((o) => [this.formatDate(o.periodDate), o]),
      );
      const legacyMap = new Map(
        legacyPayments.map((lp) => [this.formatDate(lp.subscriptionDate), lp]),
      );

      const monthlyFeeDecimal = new Prisma.Decimal(groupRecord.monthlyFee);

      months = requiredMonthDates.map((mDate) => {
        const mStr = this.formatDate(mDate);
        const obligation = obligationsMap.get(mStr);
        const legacy = legacyMap.get(mStr);
        return this.resolveMonthFeeStatus(
          mStr,
          monthlyFeeDecimal,
          obligation,
          legacy,
        );
      });

      const firstUnpaid = months.find((m) => m.status !== 'PAID');
      defaultMonth = firstUnpaid
        ? firstUnpaid.month
        : (months[0]?.month ?? null);
    }

    // جلب سجل المدفوعات من PaymentAllocation و MonthlyPayment القديمة
    const [allocations, allMonthlyPayments] = await Promise.all([
      this.prisma.paymentAllocation.findMany({
        where: {
          centerId,
          obligation: {
            studentId: resolvedStudentId,
            ...(groupRecord ? { groupId: groupRecord.id } : {}),
          },
        },
        select: {
          id: true,
          amount: true,
          refundedAmount: true,
          isLegacy: true,
          obligationId: true,
          obligation: {
            select: {
              id: true,
              groupId: true,
              periodDate: true,
              finalAmountDue: true,
              group: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          transaction: {
            select: {
              id: true,
              receiptNumber: true,
              paymentDate: true,
              paymentMethod: true,
              notes: true,
            },
          },
        },
        orderBy: [{ transaction: { paymentDate: 'asc' } }, { id: 'asc' }],
      }),
      this.prisma.monthlyPayment.findMany({
        where: {
          centerId,
          groupStudent: {
            studentId: resolvedStudentId,
            ...(groupRecord ? { groupId: groupRecord.id } : {}),
          },
        },
        select: {
          id: true,
          subscriptionDate: true,
          amount: true,
          paidAt: true,
          notes: true,
          groupStudent: {
            select: {
              groupId: true,
              group: {
                select: {
                  id: true,
                  name: true,
                  monthlyFee: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const obligationPaidRunningMap = new Map<string, Prisma.Decimal>();
    const paymentItemsMap = new Map<string, StudentPaymentHistoryItem>();

    for (const alloc of allocations) {
      const oblId = alloc.obligationId;
      const currentRunning =
        obligationPaidRunningMap.get(oblId) || new Prisma.Decimal(0);
      const newRunning = currentRunning.plus(alloc.amount);
      obligationPaidRunningMap.set(oblId, newRunning);

      const finalDue = new Prisma.Decimal(alloc.obligation.finalAmountDue);
      const remDecimal = Prisma.Decimal.max(0, finalDue.sub(newRunning));
      const remainingAfter = remDecimal.toDecimalPlaces(2).toNumber();
      const status: 'PAID' | 'PARTIALLY_PAID' =
        remainingAfter === 0 ? 'PAID' : 'PARTIALLY_PAID';

      const item: StudentPaymentHistoryItem = {
        id: alloc.id,
        receiptNumber: alloc.transaction.receiptNumber,
        groupId: alloc.obligation.groupId || alloc.obligation.group?.id || '',
        groupName: alloc.obligation.group?.name || '',
        subscriptionDate: this.formatDate(alloc.obligation.periodDate),
        amount: new Prisma.Decimal(alloc.amount).toDecimalPlaces(2).toNumber(),
        refundedAmount: new Prisma.Decimal(alloc.refundedAmount)
          .toDecimalPlaces(2)
          .toNumber(),
        amountDue: finalDue.toDecimalPlaces(2).toNumber(),
        remainingAfter,
        status,
        paymentMethod: alloc.transaction.paymentMethod,
        paidAt: alloc.transaction.paymentDate.toISOString(),
        notes: alloc.transaction.notes,
        isLegacy: Boolean(alloc.isLegacy),
      };

      paymentItemsMap.set(alloc.id, item);
    }

    const existingAllocatedTxIds = new Set(
      allocations.map((a) => a.transaction.id),
    );
    const legacyPaymentItems: StudentPaymentHistoryItem[] = [];

    for (const mp of allMonthlyPayments) {
      if (!existingAllocatedTxIds.has(mp.id)) {
        const mpAmount = new Prisma.Decimal(mp.amount)
          .toDecimalPlaces(2)
          .toNumber();
        const fee = new Prisma.Decimal(mp.groupStudent.group.monthlyFee)
          .toDecimalPlaces(2)
          .toNumber();
        legacyPaymentItems.push({
          id: mp.id,
          receiptNumber: '—',
          groupId: mp.groupStudent.groupId,
          groupName: mp.groupStudent.group.name,
          subscriptionDate: this.formatDate(mp.subscriptionDate),
          amount: mpAmount,
          refundedAmount: 0,
          amountDue: fee,
          remainingAfter: 0,
          status: 'PAID',
          paymentMethod: 'CASH',
          paidAt: mp.paidAt.toISOString(),
          notes: mp.notes,
          isLegacy: true,
        });
      }
    }

    const allPayments = [
      ...Array.from(paymentItemsMap.values()),
      ...legacyPaymentItems,
    ];
    allPayments.sort(
      (a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime(),
    );

    let totalPaidDecimal = new Prisma.Decimal(0);
    let totalRefundedDecimal = new Prisma.Decimal(0);
    for (const p of allPayments) {
      totalPaidDecimal = totalPaidDecimal.plus(
        new Prisma.Decimal(p.amount).sub(new Prisma.Decimal(p.refundedAmount)),
      );
      totalRefundedDecimal = totalRefundedDecimal.plus(
        new Prisma.Decimal(p.refundedAmount),
      );
    }

    let totalRemainingDecimal = new Prisma.Decimal(0);
    for (const m of months) {
      totalRemainingDecimal = totalRemainingDecimal.plus(
        new Prisma.Decimal(m.remainingAmount),
      );
    }

    const totals: StudentPaymentsTotals = {
      paymentsCount: allPayments.length,
      totalPaid: totalPaidDecimal.toDecimalPlaces(2).toNumber(),
      totalRefunded: totalRefundedDecimal.toDecimalPlaces(2).toNumber(),
      totalRemaining: totalRemainingDecimal.toDecimalPlaces(2).toNumber(),
    };

    const canRecordPayment = Boolean(
      groupStudent && userRole === AppRole.OWNER,
    );

    return {
      group:
        groupRecord && groupStudent
          ? {
              id: groupRecord.id,
              name: groupRecord.name,
              monthlyFee: new Prisma.Decimal(groupRecord.monthlyFee)
                .toDecimalPlaces(2)
                .toNumber(),
              startDate: this.formatDate(groupRecord.startDate),
              monthsCount: groupRecord.monthsCount,
            }
          : null,
      groupStudentId: groupStudent ? groupStudent.id : null,
      subscriptionStartDate: groupStudent
        ? this.formatDate(groupStudent.subscriptionStartDate)
        : null,
      canRecordPayment,
      months,
      defaultMonth,
      payments: allPayments,
      totals,
    };
  }

  /**
   * تصدير كشف مصفوفة مدفوعات المجموعة إلى ملف Excel.
   */
  async exportGroupPaymentsToExcel(
    centerId: string,
    groupId: string,
  ): Promise<Buffer> {
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, centerId },
      select: groupPaymentExcelSelect,
    });

    if (!group) {
      throw new NotFoundException('المجموعة الدراسية المطلوبة غير موجودة.');
    }

    const { data: studentsData } = await this.getGroupPayments(
      centerId,
      groupId,
      {
        page: 1,
        limit: 10000,
      } as GetGroupPaymentsQueryDto,
    );
    const groupMonths = this.getGroupMonths(group.startDate, group.monthsCount);
    const monthHeaders = groupMonths.map((m) => this.formatDate(m));

    const columns = [
      { header: 'اسم الطالب', key: 'fullName', width: 25 },
      { header: 'رقم الهاتف', key: 'phone', width: 16, numFmt: '@' },
      ...monthHeaders.map((m) => ({
        header: m,
        key: `month_${m}`,
        width: 16,
      })),
      { header: 'الشهور المسددة', key: 'paidCount', width: 15 },
      { header: 'الشهور المستحقة', key: 'unpaidCount', width: 15 },
    ];

    const rows = studentsData.map((st) => {
      const row: Record<string, string | number> = {
        fullName: st.studentInfo.fullName,
        phone: st.studentInfo.phone || '—',
        paidCount: st.paidMonths.length,
        unpaidCount: st.unpaidMonths.length,
      };

      const paidMap = new Map(
        st.paidMonths.map((pm) => [pm.subscriptionDate, pm.amount]),
      );

      for (const m of monthHeaders) {
        if (paidMap.has(m)) {
          row[`month_${m}`] = `مدفوع (${paidMap.get(m)} ج.م)`;
        } else if (st.unpaidMonths.includes(m)) {
          row[`month_${m}`] = 'مستحق (غير مدفوع)';
        } else {
          row[`month_${m}`] = 'غير مسجل';
        }
      }

      return row;
    });

    return this.excelService.buildWorkbookBuffer({
      sheetName: group.name.slice(0, 31),
      columns,
      data: rows,
    });
  }

  /**
   * تصدير كشف حساب مدفوعات طالب محدد إلى ملف Excel.
   */
  async exportStudentPaymentsToExcel(
    centerId: string,
    studentId: string,
    userRole: AppRole,
    userId: string,
  ): Promise<Buffer> {
    const payments = await this.getStudentPayments(
      centerId,
      studentId,
      userRole,
      userId,
    );

    const { student } = await this.resolveStudentWithAccessCheck(
      centerId,
      studentId,
      userRole,
      userId,
    );

    const studentName = student?.user?.fullName || 'الطالب';

    const columns = [
      { header: 'المجموعة الدراسية', key: 'groupName', width: 25 },
      { header: 'الشهر المستحق', key: 'subscriptionDate', width: 16 },
      { header: 'المبلغ المدفوع', key: 'amount', width: 16 },
      { header: 'تاريخ الدفع', key: 'paidAt', width: 18 },
      { header: 'ملاحظات', key: 'notes', width: 30 },
    ];

    const rows = payments.map((p) => ({
      groupName: p.groupStudent.group.name,
      subscriptionDate: this.formatDate(p.subscriptionDate),
      amount: `${Number(p.amount)} ج.م`,
      paidAt: p.paidAt ? new Date(p.paidAt).toISOString().split('T')[0] : '—',
      notes: p.notes || '—',
    }));

    return this.excelService.buildWorkbookBuffer({
      sheetName: `مدفوعات ${studentName}`.slice(0, 31),
      columns,
      data: rows,
    });
  }
}
