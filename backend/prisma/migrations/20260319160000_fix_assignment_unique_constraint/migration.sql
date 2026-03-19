-- AlterTable: Add splitProjectStatus column for independent split cell status
ALTER TABLE "Assignment" ADD COLUMN "splitProjectStatus" TEXT;

-- Deduplicate: keep only the most recently updated row per (teamMemberId, weekStart)
DELETE FROM "Assignment"
WHERE "id" NOT IN (
  SELECT "id" FROM (
    SELECT "id",
           ROW_NUMBER() OVER (
             PARTITION BY "teamMemberId", "weekStart"
             ORDER BY "updatedAt" DESC
           ) AS rn
    FROM "Assignment"
  ) sub
  WHERE sub.rn = 1
);

-- DropIndex: Remove old 3-column unique constraint
DROP INDEX "Assignment_teamMemberId_weekStart_projectName_key";

-- CreateIndex: Add new 2-column unique constraint (one assignment per member per week)
CREATE UNIQUE INDEX "Assignment_teamMemberId_weekStart_key" ON "Assignment"("teamMemberId", "weekStart");
