-- CreateEnum
CREATE TYPE "ExtraSessionType" AS ENUM ('MAKEUP', 'REVISION', 'EXAM_PREP', 'OTHER');

-- CreateEnum
CREATE TYPE "ExtraSessionStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELED');

-- CreateEnum
CREATE TYPE "ExtraSessionAudience" AS ENUM ('ALL_GROUP', 'SELECTED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'EXTRA_SESSION_SCHEDULED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'EXTRA_SESSION_CANCELED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'EXTRA_SESSION_REMINDER';

-- CreateTable
CREATE TABLE "ExtraSession" (
    "id" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "title" TEXT,
    "type" "ExtraSessionType" NOT NULL DEFAULT 'OTHER',
    "audience" "ExtraSessionAudience" NOT NULL DEFAULT 'ALL_GROUP',
    "status" "ExtraSessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "date" DATE NOT NULL,
    "hour" INTEGER NOT NULL,
    "minute" INTEGER NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "location" TEXT,
    "fee" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "notes" TEXT,
    "reminderSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtraSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtraSessionStudent" (
    "id" TEXT NOT NULL,
    "extraSessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "amountDue" DECIMAL(10,2) NOT NULL,
    "isWaived" BOOLEAN NOT NULL DEFAULT false,
    "paid" DECIMAL(10,2),
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "ExtraSessionStudent_pkey" PRIMARY KEY ("id")
);

-- AlterTable: add extraSessionId to AttendanceSession
ALTER TABLE "AttendanceSession" ADD COLUMN "extraSessionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ExtraSession_attendanceSession_key" ON "AttendanceSession"("extraSessionId");

-- CreateIndex
CREATE INDEX "ExtraSession_centerId_date_idx" ON "ExtraSession"("centerId", "date");

-- CreateIndex
CREATE INDEX "ExtraSession_groupId_idx" ON "ExtraSession"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "ExtraSessionStudent_extraSessionId_studentId_key" ON "ExtraSessionStudent"("extraSessionId", "studentId");

-- CreateIndex
CREATE INDEX "ExtraSessionStudent_studentId_idx" ON "ExtraSessionStudent"("studentId");

-- CreateIndex
CREATE INDEX "ExtraSessionStudent_centerId_idx" ON "ExtraSessionStudent"("centerId");

-- AddForeignKey
ALTER TABLE "ExtraSession" ADD CONSTRAINT "ExtraSession_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtraSession" ADD CONSTRAINT "ExtraSession_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtraSessionStudent" ADD CONSTRAINT "ExtraSessionStudent_extraSessionId_fkey" FOREIGN KEY ("extraSessionId") REFERENCES "ExtraSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtraSessionStudent" ADD CONSTRAINT "ExtraSessionStudent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_extraSessionId_fkey" FOREIGN KEY ("extraSessionId") REFERENCES "ExtraSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Drop old unique constraint on AttendanceSession
ALTER TABLE "AttendanceSession" DROP CONSTRAINT IF EXISTS "AttendanceSession_groupId_date_key";
DROP INDEX IF EXISTS "AttendanceSession_groupId_date_key";

-- Create Partial Unique Index for regular attendance sessions
CREATE UNIQUE INDEX "attendance_regular_unique"
ON "AttendanceSession" ("groupId", "date")
WHERE "extraSessionId" IS NULL;

