-- Phase 24-R02: allow two BoardCards per Assignment (one per side of a split).
-- Removes the single-column UNIQUE on assignmentId and replaces it with
-- a composite UNIQUE on (assignmentId, side). Existing rows backfill to
-- side='primary' via the column default, preserving all data.

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_BoardCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assignmentId" TEXT,
    "side" TEXT NOT NULL DEFAULT 'primary',
    "stage" TEXT NOT NULL DEFAULT 'upcoming',
    "checklist" TEXT NOT NULL DEFAULT '[]',
    "notes" TEXT NOT NULL DEFAULT '',
    "notesUpdatedAt" DATETIME,
    "notesUpdatedBy" TEXT,
    "stageLockedBy" TEXT,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BoardCard_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_BoardCard" (
    "id", "assignmentId", "stage", "checklist", "notes",
    "notesUpdatedAt", "notesUpdatedBy", "stageLockedBy", "archivedAt",
    "createdAt", "updatedAt"
)
SELECT
    "id", "assignmentId", "stage", "checklist", "notes",
    "notesUpdatedAt", "notesUpdatedBy", "stageLockedBy", "archivedAt",
    "createdAt", "updatedAt"
FROM "BoardCard";

DROP TABLE "BoardCard";
ALTER TABLE "new_BoardCard" RENAME TO "BoardCard";

CREATE UNIQUE INDEX "BoardCard_assignmentId_side_key" ON "BoardCard"("assignmentId", "side");
CREATE INDEX "BoardCard_stage_idx" ON "BoardCard"("stage");
CREATE INDEX "BoardCard_assignmentId_idx" ON "BoardCard"("assignmentId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
