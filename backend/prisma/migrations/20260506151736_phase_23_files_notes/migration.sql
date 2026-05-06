-- AlterTable
ALTER TABLE "BoardCard" ADD COLUMN "notesUpdatedAt" DATETIME;
ALTER TABLE "BoardCard" ADD COLUMN "notesUpdatedBy" TEXT;

-- CreateTable
CREATE TABLE "BoardNotification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "cardId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BoardNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BoardNotification_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "BoardCard" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BoardComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cardId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "editedAt" DATETIME,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BoardComment_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "BoardCard" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BoardComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_BoardComment" ("authorId", "body", "cardId", "createdAt", "id", "updatedAt") SELECT "authorId", "body", "cardId", "createdAt", "id", "updatedAt" FROM "BoardComment";
DROP TABLE "BoardComment";
ALTER TABLE "new_BoardComment" RENAME TO "BoardComment";
CREATE INDEX "BoardComment_cardId_idx" ON "BoardComment"("cardId");
CREATE TABLE "new_BoardFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cardId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedBy" TEXT,
    "isQuarantined" BOOLEAN NOT NULL DEFAULT false,
    "scanStatus" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BoardFile_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "BoardCard" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BoardFile_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_BoardFile" ("cardId", "createdAt", "filename", "id", "mimeType", "sizeBytes", "storedName", "uploadedBy") SELECT "cardId", "createdAt", "filename", "id", "mimeType", "sizeBytes", "storedName", "uploadedBy" FROM "BoardFile";
DROP TABLE "BoardFile";
ALTER TABLE "new_BoardFile" RENAME TO "BoardFile";
CREATE INDEX "BoardFile_cardId_idx" ON "BoardFile"("cardId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "BoardNotification_userId_isRead_idx" ON "BoardNotification"("userId", "isRead");

-- CreateIndex
CREATE INDEX "BoardNotification_cardId_idx" ON "BoardNotification"("cardId");
