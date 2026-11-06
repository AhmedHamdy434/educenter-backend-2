import { Prisma, SettlementStatus, PaymentMethod } from '@prisma/client';
import {
  teacherSettlementDetailsSelect,
  teacherSettlementListSelect,
} from '../constants/teacher-settlements.select';

export type TeacherSettlementListItemRaw = Prisma.TeacherSettlementGetPayload<{
  select: typeof teacherSettlementListSelect;
}>;

export type TeacherSettlementDetailsRaw = Prisma.TeacherSettlementGetPayload<{
  select: typeof teacherSettlementDetailsSelect;
}>;

export interface AllocationPlan {
  earningEntryId: string;
  amountToAllocate: Prisma.Decimal;
}

export interface TeacherFinancialOverviewRow {
  teacherId: string;
  teacherName: string;
  teacherPhone: string;
  teacherEmail: string;
  grossEarnings: number;
  refundAdjustments: number;
  netEarnings: number;
  settledAmount: number;
  pendingAmount: number;
  outstandingAmount: number;
  availableToSettle: number;
  unsettledEntriesCount: number;
}

export interface TeachersFinancialOverviewResult {
  centerTotals: {
    totalGrossEarnings: number;
    totalRefunds: number;
    totalNetEarnings: number;
    totalSettled: number;
    totalPending: number;
    totalOutstanding: number;
    totalAvailable: number;
  };
  teachers: TeacherFinancialOverviewRow[];
}

export interface TeacherSettlementListItem {
  id: string;
  settlementNumber: string;
  teacherId: string;
  teacherName: string;
  teacherPhone: string;
  amount: number;
  status: SettlementStatus;
  paymentMethod: PaymentMethod;
  referenceNumber: string | null;
  notes: string | null;
  settlementDate: Date;
  settledAt: Date | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  itemsCount: number;
  createdAt: Date;
}
