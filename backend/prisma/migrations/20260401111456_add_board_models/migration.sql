-- CreateTable
CREATE TABLE "BoardCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assignmentId" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'upcoming',
    "checklist" TEXT NOT NULL DEFAULT '[]',
    "notes" TEXT NOT NULL DEFAULT '',
    "stageLockedBy" TEXT,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BoardCard_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BoardComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cardId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BoardComment_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "BoardCard" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BoardComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BoardFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cardId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BoardFile_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "BoardCard" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BoardFile_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Assignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamMemberId" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "projectColor" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'placeholder',
    "weekStart" DATETIME NOT NULL,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "splitProjectName" TEXT,
    "splitProjectColor" TEXT,
    "splitProjectStatus" TEXT,
    "splitClientId" TEXT,
    "splitTags" TEXT NOT NULL DEFAULT '[]',
    "createdBy" TEXT,
    "clientId" TEXT,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Assignment_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Assignment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Assignment_splitClientId_fkey" FOREIGN KEY ("splitClientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Assignment" ("clientId", "createdAt", "createdBy", "id", "isLocked", "projectColor", "projectName", "splitClientId", "splitProjectColor", "splitProjectName", "splitProjectStatus", "splitTags", "status", "tags", "teamMemberId", "updatedAt", "weekStart") SELECT "clientId", "createdAt", "createdBy", "id", "isLocked", "projectColor", "projectName", "splitClientId", "splitProjectColor", "splitProjectName", "splitProjectStatus", "splitTags", "status", "tags", "teamMemberId", "updatedAt", "weekStart" FROM "Assignment";
DROP TABLE "Assignment";
ALTER TABLE "new_Assignment" RENAME TO "Assignment";
CREATE INDEX "Assignment_teamMemberId_idx" ON "Assignment"("teamMemberId");
CREATE INDEX "Assignment_weekStart_idx" ON "Assignment"("weekStart");
CREATE INDEX "Assignment_projectName_idx" ON "Assignment"("projectName");
CREATE INDEX "Assignment_clientId_idx" ON "Assignment"("clientId");
CREATE INDEX "Assignment_splitClientId_idx" ON "Assignment"("splitClientId");
CREATE UNIQUE INDEX "Assignment_teamMemberId_weekStart_key" ON "Assignment"("teamMemberId", "weekStart");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "BoardCard_assignmentId_key" ON "BoardCard"("assignmentId");

-- CreateIndex
CREATE INDEX "BoardCard_stage_idx" ON "BoardCard"("stage");

-- CreateIndex
CREATE INDEX "BoardCard_assignmentId_idx" ON "BoardCard"("assignmentId");

-- CreateIndex
CREATE INDEX "BoardComment_cardId_idx" ON "BoardComment"("cardId");

-- CreateIndex
CREATE INDEX "BoardFile_cardId_idx" ON "BoardFile"("cardId");
