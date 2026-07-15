---
phase: 1
plan: "01"
title: Client Notes — Data Model + API
status: complete
completed: 2026-07-10
tasks_completed: 4
tasks_total: 4
commit_hashes:
  - 3e1a398
  - a368909
  - 8aa24d4
  - a457963
deviations:
  - "Task 1: placed the three notes columns at the END of the Client model's scalar fields (after updatedAt) instead of 'after color', and hand-authored the migration.sql as three pure ALTER TABLE ... ADD COLUMN statements. Prisma 7's migration engine generated a RedefineTables/table-rebuild block for a mid-table (and even end-of-table) NOT-NULL-with-default add; that block violates must_have #1 (purely additive, ADD COLUMN only, no table redefinition). Overriding column placement to satisfy the stronger must_have. SQLite fully supports `ADD COLUMN ... NOT NULL DEFAULT ''`. Applied via `prisma migrate deploy` (never resets); `prisma migrate status` reports clean, no drift. Standard --create-only-then-edit workflow; matches the 20260506151736 BoardCard precedent."
  - "Task 4: the schedule-isolation check (case 8) asserts fixture-scoped row snapshots + marker-scoped counts instead of literal GLOBAL Assignment/TeamMember/Absence/Holiday counts. Vitest runs suites in parallel against the shared dev.db and other suites (e.g. boardPatchChecklistAccess) seed/tear down Assignment+TeamMember rows concurrently, so a global count snapshot would flake spuriously. The scoped version proves the same intent (no incidental schedule write) but is parallel-worker-safe."
pre_existing_issues:
  - "{\"test\": \"Audit Service > logAuditEvent / queryAuditLogs / verifyAuditChain / exportAuditLogs (19 tests)\", \"file\": \"tests/services/audit.test.ts\", \"error\": \"P1008 SocketTimeout on the AuditLog Serializable transaction under full-suite parallel load (SQLite single-writer contention). Passes in isolation; unrelated to client notes.\"}"
  - "{\"test\": \"templateMapping service > queryFewShotExamples (3 tests)\", \"file\": \"src/services/__tests__/templateMapping.test.ts\", \"error\": \"Mock expectation mismatch: test expects orderBy { usageCount: desc } but service now uses orderBy [{ confidence: desc }, { usageCount: desc }]. Stale test vs code drift in an untouched file.\"}"
  - "{\"test\": \"templateAdapter service > analyzeTemplate > calls Python service and LLM in correct order\", \"file\": \"src/services/__tests__/templateAdapter.test.ts\", \"error\": \"Mock call-order/expectation mismatch in an untouched file; unrelated to client notes.\"}"
  - "{\"test\": \"pdfQueue > addPdfConversionJob > rejects invalid/empty file path (2 tests)\", \"file\": \"src/services/__tests__/pdfQueue.test.ts\", \"error\": \"Environmental (Redis/BullMQ/Gotenberg dependent) failure in an untouched file.\"}"
  - "{\"test\": \"Session Service > isTrustedDevice > returns true for valid trusted device\", \"file\": \"tests/services/session.test.ts\", \"error\": \"Environmental (Redis/session store) failure in an untouched file.\"}"
  - "{\"test\": \"boardFiles routes > download/upload happy paths (3 tests)\", \"file\": \"src/routes/__tests__/boardFiles.test.ts\", \"error\": \"Environmental (ClamAV/filesystem/SQLite-lock) failures in an untouched file; documented known flakes.\"}"
  - "{\"test\": \"Stale compiled duplicates under dist/ (boardAdminArchive.test.js, boardFiles.test.js, deleteAssignmentOrphan.stopped.test.js, pdfQueue.test.js, templateAdapter.test.js, templateMapping.test.js)\", \"file\": \"backend/dist/**/*.test.js\", \"error\": \"Gitignored stale tsc build output is picked up by vitest, running pre-change compiled tests in parallel and doubling dev.db write load. Pre-existing environmental artifact; not part of this plan's scope.\"}"
ac_results:
  - criterion: "model Client gains notes String @default(\"\"), notesUpdatedAt DateTime?, notesUpdatedBy String? mirroring BoardCard; editor id is a plain String? with no relation"
    verdict: pass
    evidence: "3e1a398; backend/prisma/schema.prisma:286-291"
  - criterion: "Migration is purely additive (ADD COLUMN only, no table redefinition); applies cleanly to populated dev.db; existing clients read back notes=\"\", null attribution"
    verdict: pass
    evidence: "3e1a398; migration.sql has 3 ADD COLUMN, 0 RedefineTables; `prisma migrate status` clean; test case (1) reads notes=\"\", notesUpdatedAt=null, notesUpdatedBy=null"
  - criterion: "GET /clients/:id/notes gated by requireAuth only (NORMAL included), thin { notes, notesUpdatedAt, notesUpdatedBy } shape, 404 on unknown id"
    verdict: pass
    evidence: "8aa24d4; schedule.ts:669; test cases (1)(2)(3)"
  - criterion: "PUT /clients/:id/notes gated by requireRole('PM') — admits PM+ADMIN, rejects NORMAL 403, 404 on unknown id"
    verdict: pass
    evidence: "8aa24d4; schedule.ts:692; test cases (4)(5)(6)"
  - criterion: "Each write stamps notesUpdatedAt=new Date() and notesUpdatedBy=req.session.userId (raw id) AND writes exactly one AuditLog 'client.notes.update'; order write→audit→respond"
    verdict: pass
    evidence: "a368909 + 8aa24d4; schedule.ts:704-711; test cases (5)(7)"
  - criterion: "Notes write is a single prisma.client.update scoped to the notes columns referencing no other model; no Assignment/TeamMember/Absence/Holiday side-effect"
    verdict: pass
    evidence: "a368909; clientService.updateClientNotes; test case (8) fixture-scoped isolation proof"
  - criterion: "No socket invalidation emitted for the notes write"
    verdict: pass
    evidence: "8aa24d4; no emitScheduleInvalidate/emitBoardInvalidate in the two new handlers (grep-verified)"
  - criterion: "No frontend files modified"
    verdict: pass
    evidence: "git shows only backend/ files in all 4 commits"
---

Persisted markdown notes on the Client entity with a thin all-roles read endpoint and a PM/ADMIN-gated, audited write endpoint — the app's first audited notes-write — proven by an 8-case RBAC/attribution/audit/schedule-isolation route test.

## What Was Built

- Three additive columns on `model Client` (`notes String @default("")`, `notesUpdatedAt DateTime?`, `notesUpdatedBy String?`) mirroring BoardCard, plus a purely additive `ALTER TABLE ... ADD COLUMN` migration (no table redefinition) applied cleanly to the populated dev.db.
- `getClientNotes` / `updateClientNotes` service functions scoped to the three notes columns, with a module header documenting the schedule-isolation invariant; no audit call in the service.
- `GET /api/schedule/clients/:id/notes` (requireAuth, all roles, thin body, 404 on miss) and `PUT /api/schedule/clients/:id/notes` (requireRole('PM'), 400/404 handling) with a co-located `extractIp` helper and a post-write `logAuditEvent('client.notes.update')` in write→audit→respond order; no socket invalidation.
- `clientNotesAccess.test.ts`: NORMAL 403 write / all-roles 200 read / PM+ADMIN 200 write / raw-id attribution / exactly one audit entry / parallel-safe schedule-isolation. 8/8 green in isolation and alongside the related audited-route suite.

## Files Modified

- `backend/prisma/schema.prisma` -- edit: added three notes columns to model Client.
- `backend/prisma/migrations/20260710112154_client_notes/migration.sql` -- create: additive 3-column ALTER TABLE migration.
- `backend/src/services/clientService.ts` -- edit: added getClientNotes + updateClientNotes and the isolation-invariant header comment.
- `backend/src/routes/schedule.ts` -- edit: added GET + PUT /clients/:id/notes routes, logAuditEvent import, and extractIp helper.
- `backend/src/routes/__tests__/clientNotesAccess.test.ts` -- create: RBAC + attribution + audit + schedule-isolation coverage.

## Deviations

Two deviations, both recorded in frontmatter:

1. **Task 1 column placement + hand-authored migration.** Notes columns were placed at the end of the Client scalar fields (not "after color") and the migration was hand-written as three `ADD COLUMN` statements. Prisma 7 insisted on a `RedefineTables` table-rebuild for the `NOT NULL DEFAULT ''` add even with columns at the end; that rebuild would violate must_have #1 (purely additive, no table redefinition) and is riskier on the populated DB. The additive SQL is fully supported by SQLite, matches the BoardCard precedent (20260506151736), was applied with `prisma migrate deploy` (never resets), and `prisma migrate status` confirms a clean, drift-free DB.

2. **Task 4 isolation assertion style.** Case 8 uses fixture-scoped row snapshots + marker-scoped counts instead of literal global schedule-table counts, because parallel vitest workers mutate those tables concurrently and a global count would flake. Same intent, parallel-worker-safe.

**Environmental note (not a code defect):** Under a full `vitest run` (425 tests, doubled by stale gitignored `dist/**/*.test.js` compiled duplicates), 41 tests fail with SQLite single-writer `P1008 SocketTimeout` contention — including 2 of my own cases (6 and 8) whose audit-transaction write times out under load. My suite is deterministically 8/8 green in isolation and when run with `boardAdminArchive` (which shares the `logAuditEvent` path), confirming these are the repo's known SQLite-concurrency flakes, not a defect introduced here. See `pre_existing_issues` for the full breakdown of unrelated pre-existing failures in untouched files.
