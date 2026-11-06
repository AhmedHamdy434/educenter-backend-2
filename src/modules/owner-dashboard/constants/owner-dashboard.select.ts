import { Prisma } from '@prisma/client';

export const ownerDashboardRecentPaymentSelect = {
  id: true,
  receiptNumber: true,
  amount: true,
  paymentMethod: true,
  paymentDate: true,
  student: {
    select: {
      user: {
        select: {
          fullName: true,
          phone: true,
        },
      },
    },
  },
} satisfies Prisma.PaymentTransactionSelect;

export const ownerDashboardRecentSettlementSelect = {
  id: true,
  settlementNumber: true,
  amount: true,
  status: true,
  settlementDate: true,
  teacher: {
    select: {
      user: {
        select: {
          fullName: true,
          phone: true,
        },
      },
    },
  },
} satisfies Prisma.TeacherSettlementSelect;

export const ownerDashboardRecentStudentSelect = {
  id: true,
  createdAt: true,
  user: {
    select: {
      fullName: true,
      phone: true,
      email: true,
    },
  },
} satisfies Prisma.StudentSelect;

export const ownerDashboardRecentTeacherSelect = {
  id: true,
  createdAt: true,
  user: {
    select: {
      fullName: true,
      phone: true,
      email: true,
    },
  },
} satisfies Prisma.TeacherSelect;
