-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TeamMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "isBacklog" BOOLEAN NOT NULL DEFAULT false,
    "displayName" TEXT,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TeamMember" ("createdAt", "displayOrder", "id", "joinedAt", "status", "updatedAt", "userId") SELECT "createdAt", "displayOrder", "id", "joinedAt", "status", "updatedAt", "userId" FROM "TeamMember";
DROP TABLE "TeamMember";
ALTER TABLE "new_TeamMember" RENAME TO "TeamMember";
CREATE UNIQUE INDEX "TeamMember_userId_key" ON "TeamMember"("userId");
CREATE INDEX "TeamMember_status_idx" ON "TeamMember"("status");
CREATE INDEX "TeamMember_displayOrder_idx" ON "TeamMember"("displayOrder");
CREATE INDEX "TeamMember_isBacklog_idx" ON "TeamMember"("isBacklog");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
