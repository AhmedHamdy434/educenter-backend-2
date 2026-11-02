-- AlterTable
ALTER TABLE "ExtraSession" ADD COLUMN     "canceledAt" TIMESTAMP(3),
ADD COLUMN     "cancellationNotes" TEXT;
