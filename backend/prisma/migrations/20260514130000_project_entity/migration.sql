-- Phase 24-R03: introduce a first-class Project entity.
--
-- An Assignment has up to two "project halves" (primary + secondary). Each
-- half now links to a Project row via projectId / splitProjectId. The
-- Project is the unit of work that appears in the Planner — many Assignments
-- can reference the same Project (multi-pentester / multi-week engagements).
--
-- BoardCard becomes 1-to-1 with Project (was 1-to-1 with Assignment-side).
--
-- This migration is ADDITIVE on the historic data: existing Assignment rows
-- get projectId / splitProjectId NULL — they DO NOT auto-materialise into
-- Projects. Only future upserts (or re-saves of old rows with name + client
-- + at least one tag present) will create / link Projects. Per the team
-- decision, the old schedule stays in the schedule UI but does not appear
-- in the new Project-based Planner.

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- ── Project ────────────────────────────────────────────────────────────
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "clientId" TEXT,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "color" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'placeholder',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "Project_clientId_idx" ON "Project"("clientId");
-- The dedupe key (name, clientId, sortedTags) is enforced at the application
-- layer in projectService.upsertByKey — not as a DB unique constraint —
-- because SQLite cannot index JSON text deterministically and we want
-- projectService to control normalisation of the tags array.

-- ── Assignment: add projectId + splitProjectId ─────────────────────────
-- Rebuild Assignment to add two nullable FK columns. Existing data is
-- preserved verbatim; the two new columns default to NULL.

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
    -- Phase 24-R03 additions:
    "projectId" TEXT,
    "splitProjectId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Assignment_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Assignment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Assignment_splitClientId_fkey" FOREIGN KEY ("splitClientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Assignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Assignment_splitProjectId_fkey" FOREIGN KEY ("splitProjectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_Assignment" (
    "id", "teamMemberId", "projectName", "projectColor", "status",
    "weekStart", "isLocked", "splitProjectName", "splitProjectColor",
    "splitProjectStatus", "splitClientId", "splitTags", "createdBy",
    "clientId", "tags", "createdAt", "updatedAt"
)
SELECT
    "id", "teamMemberId", "projectName", "projectColor", "status",
    "weekStart", "isLocked", "splitProjectName", "splitProjectColor",
    "splitProjectStatus", "splitClientId", "splitTags", "createdBy",
    "clientId", "tags", "createdAt", "updatedAt"
FROM "Assignment";

DROP TABLE "Assignment";
ALTER TABLE "new_Assignment" RENAME TO "Assignment";

CREATE UNIQUE INDEX "Assignment_teamMemberId_weekStart_key" ON "Assignment"("teamMemberId", "weekStart");
CREATE INDEX "Assignment_teamMemberId_idx" ON "Assignment"("teamMemberId");
CREATE INDEX "Assignment_weekStart_idx" ON "Assignment"("weekStart");
CREATE INDEX "Assignment_projectName_idx" ON "Assignment"("projectName");
CREATE INDEX "Assignment_clientId_idx" ON "Assignment"("clientId");
CREATE INDEX "Assignment_splitClientId_idx" ON "Assignment"("splitClientId");
CREATE INDEX "Assignment_projectId_idx" ON "Assignment"("projectId");
CREATE INDEX "Assignment_splitProjectId_idx" ON "Assignment"("splitProjectId");

-- ── BoardCard: rekey on projectId ───────────────────────────────────────
-- Per team decision: drop existing cards (test data only) and rebuild the
-- table so BoardCard is 1-to-1 with Project. Old assignmentId/side columns
-- are removed. New Planner cards are created when upsertAssignment links a
-- new Project (see backend projectService.upsertByKey + linkProjects).

CREATE TABLE "new_BoardCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'upcoming',
    "checklist" TEXT NOT NULL DEFAULT '[]',
    "notes" TEXT NOT NULL DEFAULT '',
    "notesUpdatedAt" DATETIME,
    "notesUpdatedBy" TEXT,
    "stageLockedBy" TEXT,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BoardCard_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- DROP existing BoardCard rows (3 prod test cards; per team decision they go).
-- We do NOT copy any data into new_BoardCard; the old table is replaced empty.
DROP TABLE "BoardCard";
ALTER TABLE "new_BoardCard" RENAME TO "BoardCard";

CREATE UNIQUE INDEX "BoardCard_projectId_key" ON "BoardCard"("projectId");
CREATE INDEX "BoardCard_stage_idx" ON "BoardCard"("stage");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
