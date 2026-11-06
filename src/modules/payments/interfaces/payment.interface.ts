import { Prisma } from '@prisma/client';
import {
  groupPaymentExcelSelect,
  groupPaymentsSelect,
  payMonthGroupStudentSelect,
  studentPaymentSelect,
} from '../constants/payment.select';

export type StudentPaymentItem = Prisma.MonthlyPaymentGetPayload<{
  select: typeof studentPaymentSelect;
}>;

export type GroupPaymentsDetails = Prisma.GroupGetPayload<{
  select: typeof groupPaymentsSelect;
}>;

export interface GroupPaymentStats {
  /** الشهر المستهدف الذي احتُسبت عليه الإحصائيات (YYYY-MM-01) */
  activeMonth: string;
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

export interface GroupPaymentCurrentMonth {
  month: string;
  isRequired: boolean;
  isPaid: boolean;
  status?: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';
  amountDue?: number;
  paidAmount?: number;
  remainingAmount?: number;
  payment: {
    id: string;
    amount: number;
    paidAt: Date;
    notes: string | null;
  } | null;
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
  currentMonth: GroupPaymentCurrentMonth;
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

export type PayMonthGroupStudent = Prisma.GroupStudentGetPayload<{
  select: typeof payMonthGroupStudentSelect;
}>;

export type GroupPaymentExcelItem = Prisma.GroupGetPayload<{
  select: typeof groupPaymentExcelSelect;
}>;

