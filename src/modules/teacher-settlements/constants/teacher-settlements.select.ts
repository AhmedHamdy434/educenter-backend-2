import { Prisma } from '@prisma/client';

export const teacherSettlementTeacherUserSelect = {
  fullName: true,
  phone: true,
  email: true,
} satisfies Prisma.UserSelect;

export const teacherSettlementListSelect = {
  id: true,
  settlementNumber: true,
  teacherId: true,
  centerId: true,
  amount: true,
  status: true,
  paymentMethod: true,
  referenceNumber: true,
  notes: true,
  settlementDate: true,
  settledAt: true,
  cancelledAt: true,
  cancellationReason: true,
  createdAt: true,
  updatedAt: true,
  teacher: {
    select: {
      id: true,
      user: {
        select: {
          fullName: true,
          phone: true,
        },
      },
    },
  },
  items: {
    select: {
      id: true,
      earningEntryId: true,
      allocatedAmount: true,
      earningEntry: {
        select: {
          id: true,
          entryNumber: true,
          amount: true,
          entryDate: true,
          notes: true,
        },
      },
    },
  },
} satisfies Prisma.TeacherSettlementSelect;

export const teacherSettlementDetailsSelect = {
  ...teacherSettlementListSelect,
  teacher: {
    select: {
      id: true,
      user: {
        select: teacherSettlementTeacherUserSelect,
      },
    },
  },
  items: {
    include: {
      earningEntry: {
        include: {
          sourceAllocation: {
            include: {
              transaction: {
                select: {
                  receiptNumber: true,
                  paymentDate: true,
                  paymentMethod: true,
                },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.TeacherSettlementSelect;

