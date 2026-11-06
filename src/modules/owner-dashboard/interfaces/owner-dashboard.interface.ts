import { DashboardPeriod } from '../dto/get-owner-dashboard.dto';

export interface OwnerDashboardSubscriptionHealth {
  planName: string;
  planType: string;
  status: string;
  startDate: Date;
  endDate: Date;
  daysRemaining: number;
  isGracePeriod: boolean;
  remainingGraceDays: number;
  canCreateExams: boolean;
  studentQuota: {
    current: number;
    limit: number;
    usagePercent: number;
  };
  teacherQuota: {
    current: number;
    limit: number;
    usagePercent: number;
  };
}

export interface OwnerDashboardOperationalStats {
  totalStudents: number;
  activeStudents: number;
  totalTeachers: number;
  totalGroups: number;
  activeGroups: number;
  totalSubjects: number;
  totalGrades: number;
}

export interface OwnerDashboardFinancialMetrics {
  collectedRevenue: number;
  totalRefunds: number;
  netCollectedRevenue: number;
  teacherGrossEarnings: number;
  teacherNetEarnings: number;
  centerGrossShare: number;
  settledPayouts: number;
  currentPendingReserve: number;
  outstandingTeacherLiabilities: number;
  outstandingStudentReceivables: number;
  studentCreditBalances: number;
}

export interface OwnerDashboardRecentActivity {
  payments: {
    id: string;
    receiptNumber: string;
    studentName: string;
    studentPhone: string | null;
    amount: number;
    paymentMethod: any;
    paymentDate: Date;
  }[];
  settlements: {
    id: string;
    settlementNumber: string;
    teacherName: string;
    teacherPhone: string | null;
    amount: number;
    status: any;
    settlementDate: Date;
  }[];
  students: {
    id: string;
    name: string;
    phone: string | null;
    createdAt: Date;
  }[];
  teachers: {
    id: string;
    name: string;
    phone: string | null;
    createdAt: Date;
  }[];
}

export interface OwnerDashboardData {
  period: DashboardPeriod;
  dateRange: {
    from?: Date;
    to?: Date;
  };
  subscriptionHealth: OwnerDashboardSubscriptionHealth | null;
  operationalStats: OwnerDashboardOperationalStats;
  financialMetrics: OwnerDashboardFinancialMetrics;
  recentActivity: OwnerDashboardRecentActivity;
}
