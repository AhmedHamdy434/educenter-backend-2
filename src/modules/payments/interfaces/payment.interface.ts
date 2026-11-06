import { PaymentAllocation, PaymentTransaction, Prisma } from '@prisma/client';
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

export interface StudentPaymentMonthItem {
  month: string;
  amountDue: number;
  paidAmount: number;
  remainingAmount: number;
  status: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';
  isWaived: boolean;
}

export interface StudentPaymentHistoryItem {
  id: string;
  receiptNumber: string;
  groupId: string;
  groupName: string;
  subscriptionDate: string;
  amount: number;
  refundedAmount: number;
  amountDue: number;
  remainingAfter: number;
  status: 'PAID' | 'PARTIALLY_PAID';
  paymentMethod: string;
  paidAt: string;
  notes: string | null;
  isLegacy: boolean;
}

export interface StudentPaymentsTotals {
  paymentsCount: number;
  totalPaid: number;
  totalRefunded: number;
  totalRemaining: number;
}

export interface StudentPaymentsSummaryData {
  group: {
    id: string;
    name: string;
    monthlyFee: number;
    startDate: string;
    monthsCount: number;
  } | null;
  groupStudentId: string | null;
  subscriptionStartDate: string | null;
  canRecordPayment: boolean;
  months: StudentPaymentMonthItem[];
  defaultMonth: string | null;
  payments: StudentPaymentHistoryItem[];
  totals: StudentPaymentsTotals;
}

export interface PayMonthResponse {
  id: string;
  groupStudentId: string;
  centerId: string;
  subscriptionDate: Date;
  amount: Prisma.Decimal;
  paidAt: Date;
  notes: string | null;
  receiptNumber: string;
  transaction: PaymentTransaction;
  allocation: PaymentAllocation;
  obligation: {
    id: string;
    amountDue: number;
    paidAmount: number;
    remainingAmount: number;
    status: string;
  };
  month: StudentPaymentMonthItem;
}
