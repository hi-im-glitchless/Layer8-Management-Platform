-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN "splitClientId" TEXT;
ALTER TABLE "Assignment" ADD COLUMN "splitTags" TEXT NOT NULL DEFAULT '[]';

-- CreateIndex
CREATE INDEX "Assignment_splitClientId_idx" ON "Assignment"("splitClientId");
