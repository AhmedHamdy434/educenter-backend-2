-- CreateEnum
CREATE TYPE "ObligationType" AS ENUM ('MONTHLY_TUITION', 'EXTRA_SESSION');

-- CreateEnum
CREATE TYPE "ObligationStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'INSTAPAY', 'VODAFONE_CASH', 'BANK_TRANSFER', 'OTHER');

-- CreateEnum
CREATE TYPE "TeacherEarningType" AS ENUM ('EARNING', 'REFUND_ADJUSTMENT', 'SETTLEMENT', 'REVERSAL');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "CenterSettings" (
    "id" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "centerSharePercentage" DECIMAL(5,2) NOT NULL DEFAULT 20.00,
    "teacherSharePercentage" DECIMAL(5,2) NOT NULL DEFAULT 80.00,
    "allowStudentCreditAdvance" BOOLEAN NOT NULL DEFAULT true,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "receiptNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CenterSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentFeeObligation" (
    "id" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "groupId" TEXT,
    "groupStudentId" TEXT,
    "extraSessionId" TEXT,
    "teacherId" TEXT NOT NULL,
    "type" "ObligationType" NOT NULL DEFAULT 'MONTHLY_TUITION',
    "periodDate" DATE NOT NULL,
    "amountDue" DECIMAL(10,2) NOT NULL,
    "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "finalAmountDue" DECIMAL(10,2) NOT NULL,
    "paidAmount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "remainingAmount" DECIMAL(10,2) NOT NULL,
    "status" "ObligationStatus" NOT NULL DEFAULT 'UNPAID',
    "lockedTeacherShareRate" DECIMAL(5,2) NOT NULL,
    "lockedCenterShareRate" DECIMAL(5,2) NOT NULL,
    "isWaived" BOOLEAN NOT NULL DEFAULT false,
    "isLegacy" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentFeeObligation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentTransaction" (
    "id" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "allocatedAmount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "unallocatedAmount" DECIMAL(10,2) NOT NULL,
    "refundedAmount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isLegacy" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "obligationId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "teacherShareRate" DECIMAL(5,2) NOT NULL,
    "centerShareRate" DECIMAL(5,2) NOT NULL,
    "teacherAmount" DECIMAL(10,2) NOT NULL,
    "centerAmount" DECIMAL(10,2) NOT NULL,
    "refundedAmount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "isLegacy" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherEarningEntry" (
    "id" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "entryNumber" TEXT NOT NULL,
    "type" "TeacherEarningType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "sourceAllocationId" TEXT,
    "sourceRefundId" TEXT,
    "sourceSettlementId" TEXT,
    "allocatedToSettlementAmount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "notes" TEXT,
    "entryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeacherEarningEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherSettlement" (
    "id" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "settlementNumber" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'COMPLETED',
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "referenceNumber" TEXT,
    "notes" TEXT,
    "settlementDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeacherSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementItem" (
    "id" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "earningEntryId" TEXT NOT NULL,
    "allocatedAmount" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SettlementItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentRefund" (
    "id" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "allocationId" TEXT,
    "refundNumber" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "teacherRefundShare" DECIMAL(10,2) NOT NULL,
    "centerRefundShare" DECIMAL(10,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "refundDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentRefund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CenterSettings_centerId_key" ON "CenterSettings"("centerId");

-- CreateIndex
CREATE INDEX "CenterSettings_centerId_idx" ON "CenterSettings"("centerId");

-- CreateIndex
CREATE INDEX "StudentFeeObligation_centerId_status_idx" ON "StudentFeeObligation"("centerId", "status");

-- CreateIndex
CREATE INDEX "StudentFeeObligation_studentId_idx" ON "StudentFeeObligation"("studentId");

-- CreateIndex
CREATE INDEX "StudentFeeObligation_teacherId_idx" ON "StudentFeeObligation"("teacherId");

-- CreateIndex
CREATE INDEX "StudentFeeObligation_periodDate_idx" ON "StudentFeeObligation"("periodDate");

-- CreateIndex
CREATE UNIQUE INDEX "StudentFeeObligation_groupStudentId_periodDate_key" ON "StudentFeeObligation"("groupStudentId", "periodDate");

-- CreateIndex
CREATE INDEX "PaymentTransaction_centerId_idx" ON "PaymentTransaction"("centerId");

-- CreateIndex
CREATE INDEX "PaymentTransaction_studentId_idx" ON "PaymentTransaction"("studentId");

-- CreateIndex
CREATE INDEX "PaymentTransaction_paymentDate_idx" ON "PaymentTransaction"("paymentDate");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTransaction_centerId_receiptNumber_key" ON "PaymentTransaction"("centerId", "receiptNumber");

-- CreateIndex
CREATE INDEX "PaymentAllocation_transactionId_idx" ON "PaymentAllocation"("transactionId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_obligationId_idx" ON "PaymentAllocation"("obligationId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_centerId_idx" ON "PaymentAllocation"("centerId");

-- CreateIndex
CREATE INDEX "TeacherEarningEntry_centerId_teacherId_idx" ON "TeacherEarningEntry"("centerId", "teacherId");

-- CreateIndex
CREATE INDEX "TeacherEarningEntry_type_idx" ON "TeacherEarningEntry"("type");

-- CreateIndex
CREATE INDEX "TeacherEarningEntry_entryDate_idx" ON "TeacherEarningEntry"("entryDate");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherEarningEntry_centerId_entryNumber_key" ON "TeacherEarningEntry"("centerId", "entryNumber");

-- CreateIndex
CREATE INDEX "TeacherSettlement_centerId_idx" ON "TeacherSettlement"("centerId");

-- CreateIndex
CREATE INDEX "TeacherSettlement_teacherId_idx" ON "TeacherSettlement"("teacherId");

-- CreateIndex
CREATE INDEX "TeacherSettlement_status_idx" ON "TeacherSettlement"("status");

-- CreateIndex
CREATE INDEX "TeacherSettlement_settlementDate_idx" ON "TeacherSettlement"("settlementDate");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherSettlement_centerId_settlementNumber_key" ON "TeacherSettlement"("centerId", "settlementNumber");

-- CreateIndex
CREATE INDEX "SettlementItem_settlementId_idx" ON "SettlementItem"("settlementId");

-- CreateIndex
CREATE INDEX "SettlementItem_earningEntryId_idx" ON "SettlementItem"("earningEntryId");

-- CreateIndex
CREATE INDEX "PaymentRefund_centerId_idx" ON "PaymentRefund"("centerId");

-- CreateIndex
CREATE INDEX "PaymentRefund_transactionId_idx" ON "PaymentRefund"("transactionId");

-- CreateIndex
CREATE INDEX "PaymentRefund_allocationId_idx" ON "PaymentRefund"("allocationId");

-- CreateIndex
CREATE INDEX "PaymentRefund_refundDate_idx" ON "PaymentRefund"("refundDate");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRefund_centerId_refundNumber_key" ON "PaymentRefund"("centerId", "refundNumber");

-- AddForeignKey
ALTER TABLE "CenterSettings" ADD CONSTRAINT "CenterSettings_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentFeeObligation" ADD CONSTRAINT "StudentFeeObligation_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentFeeObligation" ADD CONSTRAINT "StudentFeeObligation_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentFeeObligation" ADD CONSTRAINT "StudentFeeObligation_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentFeeObligation" ADD CONSTRAINT "StudentFeeObligation_groupStudentId_fkey" FOREIGN KEY ("groupStudentId") REFERENCES "GroupStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentFeeObligation" ADD CONSTRAINT "StudentFeeObligation_extraSessionId_fkey" FOREIGN KEY ("extraSessionId") REFERENCES "ExtraSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentFeeObligation" ADD CONSTRAINT "StudentFeeObligation_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "PaymentTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "StudentFeeObligation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherEarningEntry" ADD CONSTRAINT "TeacherEarningEntry_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherEarningEntry" ADD CONSTRAINT "TeacherEarningEntry_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherEarningEntry" ADD CONSTRAINT "TeacherEarningEntry_sourceAllocationId_fkey" FOREIGN KEY ("sourceAllocationId") REFERENCES "PaymentAllocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherEarningEntry" ADD CONSTRAINT "TeacherEarningEntry_sourceRefundId_fkey" FOREIGN KEY ("sourceRefundId") REFERENCES "PaymentRefund"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherEarningEntry" ADD CONSTRAINT "TeacherEarningEntry_sourceSettlementId_fkey" FOREIGN KEY ("sourceSettlementId") REFERENCES "TeacherSettlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherSettlement" ADD CONSTRAINT "TeacherSettlement_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherSettlement" ADD CONSTRAINT "TeacherSettlement_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementItem" ADD CONSTRAINT "SettlementItem_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "TeacherSettlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementItem" ADD CONSTRAINT "SettlementItem_earningEntryId_fkey" FOREIGN KEY ("earningEntryId") REFERENCES "TeacherEarningEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "PaymentTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "PaymentAllocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
