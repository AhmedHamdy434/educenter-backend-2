import { Prisma } from '@prisma/client';

/**
 * تحديد حقول سجل مدفوعات الطالب مع بيانات المجموعة والاشتراك
 */
export const studentPaymentSelect = {
  id: true,
  groupStudentId: true,
  subscriptionDate: true,
  amount: true,
  paidAt: true,
  notes: true,
  createdAt: true,
  groupStudent: {
    select: {
      id: true,
      groupId: true,
      group: {
        select: {
          id: true,
          name: true,
          monthlyFee: true,
          startDate: true,
          monthsCount: true,
        },
      },
    },
  },
} satisfies Prisma.MonthlyPaymentSelect;

export type StudentPaymentItem = Prisma.MonthlyPaymentGetPayload<{
  select: typeof studentPaymentSelect;
}>;

/**
 * تحديد حقول مدفوعات طلاب المجموعة بالكامل
 */
export const groupPaymentsSelect = {
  id: true,
  name: true,
  startDate: true,
  monthsCount: true,
  monthlyFee: true,
  students: {
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
  },
} satisfies Prisma.GroupSelect;

export type GroupPaymentsDetails = Prisma.GroupGetPayload<{
  select: typeof groupPaymentsSelect;
}>;

export interface GroupPaymentStats {
  /** إجمالي الطلاب المسجلين في المجموعة (بدون فلترة صفحة) */
  total: number;
  /** عدد الطلاب المسددين للشهر المُفلتر (أو كل الأشهر إن لم يُحدَّد شهر) */
  paid: number;
  /** عدد الطلاب غير المسددين */
  unpaid: number;
  /** الإيراد المتوقع (ج.م) للشهر المستهدف */
  expected: number;
  /** الإيراد المحصَّل فعلياً (ج.م) */
  collected: number;
  /** شهور المجموعة الكاملة (لعرض فلتر الشهور في الواجهة) */
  groupMonths: string[];
}

export interface GroupPaymentStudentItem {
  groupStudentId: string;
  studentId: string;
  studentInfo: {
    fullName: string;
    code?: string;
    email: string | null;
    phone: string | null;
    avatar: string | null;
  };
  subscriptionStartDate: string;
  monthlyFee: number;
  requiredMonths: string[];
  paidMonths: {
    id: string;
    subscriptionDate: string;
    amount: number;
    paidAt: Date;
    notes: string | null;
  }[];
  unpaidMonths: string[];
}

export const payMonthGroupStudentSelect = {
  id: true,
  subscriptionStartDate: true,
  group: {
    select: {
      id: true,
      centerId: true,
      startDate: true,
      monthsCount: true,
      monthlyFee: true,
    },
  },
} satisfies Prisma.GroupStudentSelect;

export type PayMonthGroupStudent = Prisma.GroupStudentGetPayload<{
  select: typeof payMonthGroupStudentSelect;
}>;

/**
 * تحديد حقول المجموعة الأساسية عند تصدير كشف الحساب
 */
export const groupPaymentExcelSelect = {
  id: true,
  name: true,
  startDate: true,
  monthsCount: true,
} satisfies Prisma.GroupSelect;

export type GroupPaymentExcelItem = Prisma.GroupGetPayload<{
  select: typeof groupPaymentExcelSelect;
}>;
