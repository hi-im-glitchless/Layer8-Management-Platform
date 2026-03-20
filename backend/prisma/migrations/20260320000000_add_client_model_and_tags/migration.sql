-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
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
    "createdBy" TEXT,
    "clientId" TEXT,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Assignment_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Assignment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Assignment" ("createdAt", "createdBy", "id", "isLocked", "projectColor", "projectName", "splitProjectColor", "splitProjectName", "splitProjectStatus", "status", "teamMemberId", "updatedAt", "weekStart") SELECT "createdAt", "createdBy", "id", "isLocked", "projectColor", "projectName", "splitProjectColor", "splitProjectName", "splitProjectStatus", "status", "teamMemberId", "updatedAt", "weekStart" FROM "Assignment";
DROP TABLE "Assignment";
ALTER TABLE "new_Assignment" RENAME TO "Assignment";
CREATE INDEX "Assignment_teamMemberId_idx" ON "Assignment"("teamMemberId");
CREATE INDEX "Assignment_weekStart_idx" ON "Assignment"("weekStart");
CREATE INDEX "Assignment_projectName_idx" ON "Assignment"("projectName");
CREATE INDEX "Assignment_clientId_idx" ON "Assignment"("clientId");
CREATE UNIQUE INDEX "Assignment_teamMemberId_weekStart_key" ON "Assignment"("teamMemberId", "weekStart");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Client_name_key" ON "Client"("name");
