/*
  Warnings:

  - You are about to drop the column `reminderSentAt` on the `ExtraSession` table. All the data in the column will be lost.
  - You are about to drop the `AuditLog` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Notification` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ParentMagicToken` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_centerId_fkey";

-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_userId_fkey";

-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_centerId_fkey";

-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_userId_fkey";

-- DropForeignKey
ALTER TABLE "ParentMagicToken" DROP CONSTRAINT "ParentMagicToken_studentId_fkey";

-- AlterTable
ALTER TABLE "ExtraSession" DROP COLUMN "reminderSentAt",
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- DropTable
DROP TABLE "AuditLog";

-- DropTable
DROP TABLE "Notification";

-- DropTable
DROP TABLE "ParentMagicToken";

-- DropEnum
DROP TYPE "AuditAction";

-- DropEnum
DROP TYPE "NotificationType";

-- RenameIndex
ALTER INDEX "ExtraSession_attendanceSession_key" RENAME TO "AttendanceSession_extraSessionId_key";
