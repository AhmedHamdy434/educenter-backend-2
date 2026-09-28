-- AlterTable
ALTER TABLE "Student" ADD COLUMN "code" TEXT;

-- Backfill unique codes for existing rows
DO $$
DECLARE
    r RECORD;
    i INT := 100000;
BEGIN
    FOR r IN SELECT id FROM "Student" WHERE "code" IS NULL ORDER BY "createdAt" ASC LOOP
        UPDATE "Student" SET "code" = 'STU-' || i WHERE id = r.id;
        i := i + 1;
    END LOOP;
END $$;

-- Make code column NOT NULL
ALTER TABLE "Student" ALTER COLUMN "code" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Student_code_key" ON "Student"("code");
