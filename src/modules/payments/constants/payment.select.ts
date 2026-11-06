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

export const payMonthGroupStudentSelect = {
  id: true,
  studentId: true,
  groupId: true,
  subscriptionStartDate: true,
  group: {
    select: {
      id: true,
      centerId: true,
      startDate: true,
      monthsCount: true,
      monthlyFee: true,
      teacherId: true,
    },
  },
} satisfies Prisma.GroupStudentSelect;

/**
 * تحديد حقول المجموعة الأساسية عند تصدير كشف الحساب
 */
export const groupPaymentExcelSelect = {
  id: true,
  name: true,
  startDate: true,
  monthsCount: true,
} satisfies Prisma.GroupSelect;
