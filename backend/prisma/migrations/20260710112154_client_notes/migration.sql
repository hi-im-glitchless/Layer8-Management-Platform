-- AlterTable
-- Purely additive: three new columns appended to "Client". SQLite supports
-- ADD COLUMN for a NOT NULL column when a DEFAULT is supplied, and for nullable
-- columns without one, so no table rebuild/redefinition is needed. Existing rows
-- read back notes='' and null attribution. Mirrors the BoardCard notes columns
-- added in 20260506151736_phase_23_files_notes.
ALTER TABLE "Client" ADD COLUMN "notes" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Client" ADD COLUMN "notesUpdatedAt" DATETIME;
ALTER TABLE "Client" ADD COLUMN "notesUpdatedBy" TEXT;
