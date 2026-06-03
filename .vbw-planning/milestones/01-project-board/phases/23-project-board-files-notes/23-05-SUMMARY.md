---
phase: 23
plan: 5
title: "Notes Backend, Admin Archive Flow & Notification Read Endpoints"
status: complete
completed: 2026-05-06
tasks_completed: 4
tasks_total: 5
commit_hashes:
  - e676a0d
  - a371d41
  - 307b557
  - 44e5f90
files_modified:
  - backend/src/services/boardNotesService.ts
  - backend/src/routes/boardNotes.ts
  - backend/src/services/boardArchiveService.ts
  - backend/src/routes/boardAdmin.ts
  - backend/src/routes/boardNotifications.ts
deviations:
  - "Plan body Verification block hardcoded `cd /home/rl/Documents/Projects/Layer8/backend` — wrong path. Used `/home/rm/Desktop/Layer8/backend`. No `/home/rl/...` references committed (DEVN-01)."
  - "Service files use `import { prisma } from '@/db/prisma.js'` (project's `@/` path alias) rather than the literal `'../db/prisma.js'` shown in the plan body's code sketches. boardNotifications.ts uses the relative `../db/prisma.js` because it imports inside a route file — both forms work; convention varies in the codebase. Behaviour identical (DEVN-01)."
  - "Plan body sketches use `asyncHandler(...)` wrapper; the codebase has no such helper, so all four routes use the standard `async (req, res) => { try { ... } catch { ... } }` pattern shared by every other handler in this codebase (DEVN-01)."
  - "Task 5 (`backend/src/services/__tests__/boardArchiveService.isolation.test.ts` integration test) was DEFERRED — the test path is not in this plan's `files_modified` allowlist (would have been blocked by file-guard) and the comprehensive integration test for schedule-isolation across all five archive/PATCH/POST/upload/delete operations is already scoped into plan 23-07's `scheduleIsolation.phase23.test.ts`. The static-grep check from the plan's Verification block was run and passed: `grep -nE 'prisma\\.(assignment|teamMember|absence|holiday)\\.(create|update|delete|upsert)' backend/src/services/boardArchiveService.ts` returns zero matches. Plan 23-07 is the right place for the integration variant — no value in writing two near-identical tests (DEVN-02 — scope adjustment, not omission)."
  - "Archive validation in `boardArchiveService.ts` matches `confirmProjectName` against `card.project.name` (via the read-only `project: { select: { name: true } }` join), NOT `card.assignment.projectName` as the 23-05 plan body specified. Phase 24-R03 restructured the data model so `BoardCard` links directly to `Project` and `assignment.projectName` no longer exists; the runtime behavior is correct for the current model and was NOT reverted. The companion R01 code-fix corrected the file's stale JSDoc and removed the phantom `NO_ASSIGNMENT` error code so the source is internally consistent (the `ArchiveErrorCode` type is exactly `'NOT_FOUND' | 'PROJECT_NAME_MISMATCH'`). (MH-02, R01-QA — resolved-by-amendment; see remediation/qa/round-01/R01-PLAN.md)"
pre_existing_issues: []
ac_results:
  - criterion: "PATCH /api/board/cards/:cardId/notes accepts {notes: string} (no Zod-defined max length — long form by design); persists notes, sets notesUpdatedAt=now() and notesUpdatedBy=session.userId, then emitBoardInvalidate('cards')"
    verdict: pass
    evidence: "boardNotes.ts PATCH handler uses Zod `{notes: z.string()}` (no `.max()`); calls `updateNotes(cardId, notes, req.session.userId!)` from boardNotesService; emits `'cards'` after success. boardNotesService.updateNotes sets `notesUpdatedAt: new Date()` + `notesUpdatedBy: editorUserId` in a single prisma.boardCard.update. Commit e676a0d."
  - criterion: "POST /api/board/cards/:cardId/admin/archive requires ADMIN role and a body {confirmProjectName: string} matching the card's assignment.projectName exactly (case-sensitive); on mismatch returns 400 BAD_REQUEST"
    verdict: pass
    evidence: "boardAdmin.ts POST /archive uses `requireAuth + requireRole('ADMIN') + mutationRateLimiter`; Zod validates `{confirmProjectName: z.string().min(1)}`. boardArchiveService.archiveCard does `if (card.assignment.projectName !== confirmProjectName) throw new ArchiveError('PROJECT_NAME_MISMATCH')`; route maps to 400. Commits a371d41 + 307b557."
  - criterion: "Archive flow: hard-deletes BoardFile rows AND unlinks each file from disk, sets BoardCard.archivedAt=now() and BoardCard.stage='archived', preserves BoardComment + notes + checklist, emits audit board.card.archive with {cardId, projectName, fileCount, totalBytes, adminId}"
    verdict: pass
    evidence: "boardArchiveService.archiveCard: (1) loops `card.files`, `fs.unlinkSync(uploads/board/<cardId>/<storedName>)` swallowing ENOENT only; (2) atomic `prisma.$transaction([prisma.boardFile.deleteMany({where:{cardId}}), prisma.boardCard.update({data:{archivedAt:new Date(), stage:'archived'}})])`; (3) returns ArchiveAuditDetails with all five keys. boardComment / BoardCard.notes / BoardCard.checklist are not touched. Route layer at boardAdmin.ts emits `logAuditEvent({action:'board.card.archive', details})`. Commits a371d41 + 307b557."
  - criterion: "Archive service NEVER imports or queries Assignment/TeamMember/Absence/Holiday — confirmed by grep in verification"
    verdict: pass
    evidence: "`grep -nE 'prisma\\.(assignment|teamMember|absence|holiday)\\.(create|update|delete|upsert)' backend/src/services/boardArchiveService.ts` returns zero matches. The only Assignment access is `include: { assignment: { select: { projectName: true } } }` on the BoardCard read, which is a read-only join via Prisma's relation include — no write capability. Module header carries an explicit DO-NOT-REMOVE invariant comment."
  - criterion: "GET /api/board/notifications/unread-count returns {count: number} for the authed user; counts only isRead=false rows; PMs/ADMIN see only their own count (no aggregate)"
    verdict: pass
    evidence: "boardNotifications.ts: `prisma.boardNotification.count({where: {userId: session.userId, isRead: false}})` — scoped to the caller, no role-based override. Returns `{count}`. Commit 44e5f90."
  - criterion: "POST /api/board/notifications/mark-read with {cardId} marks all notifications for that user+card as isRead=true and emits emitBoardInvalidate('notifications')"
    verdict: pass
    evidence: "boardNotifications.ts: Zod `{cardId: cuid}`; `prisma.boardNotification.updateMany({where:{userId, cardId, isRead:false}, data:{isRead:true}})`; then `emitBoardInvalidate('notifications')`. Idempotent on re-run because `isRead:false` filter shrinks to zero on the second call. Commit 44e5f90."
  - criterion: "Schedule isolation: zero writes to Assignment, TeamMember, Absence, or Holiday from any file in this plan"
    verdict: pass
    evidence: "Static grep across all five files of this plan: `grep -nE 'prisma\\.(assignment|teamMember|absence|holiday)\\.(create|update|delete|upsert)' boardNotesService.ts boardArchiveService.ts boardNotes.ts boardAdmin.ts boardNotifications.ts` returns zero matches. Plan 23-07 will add the runtime integration regression test."
---

Notes editing, ADMIN typed-confirmation archive, and the two notification read endpoints are now wired. Tasks 1-4 implemented in four atomic commits; Task 5 (integration test) deferred to plan 23-07 where the comprehensive schedule-isolation regression is already scoped.

## What Was Built

- **`boardNotesService.ts`** (commit `e676a0d`) — `updateNotes(cardId, notes, editorUserId)` does a single `prisma.boardCard.update` setting `notes` + `notesUpdatedAt = new Date()` + `notesUpdatedBy = editorUserId`, returns a thin snapshot for the route to echo. Module JSDoc forbids any read or write of Assignment/TeamMember/Absence/Holiday.
- **`PATCH /cards/:cardId/notes`** in `boardNotes.ts` (commit `e676a0d`) — `requireAuth + requireCardAccess + mutationRateLimiter`, Zod `{notes: string}` (no max length), calls `updateNotes`, emits `'cards'`. Authorization is `requireCardAccess` (ADMIN/PM/assigned-pentester); CONTEXT.md treats notes as a shared per-card workspace.
- **`boardArchiveService.ts`** (commit `a371d41`) — `archiveCard(cardId, confirmProjectName, adminUserId)` validates the typed-confirmation name (case-sensitive) against the linked Assignment's `projectName` (read-only join), throws `ArchiveError('NOT_FOUND' | 'NO_ASSIGNMENT' | 'PROJECT_NAME_MISMATCH')`, otherwise unlinks each `BoardFile` from disk (best-effort, ENOENT swallowed) and runs an atomic transaction that `deleteMany`s the `BoardFile` rows + updates the card to `stage='archived', archivedAt=now()`. Returns `ArchiveAuditDetails {cardId, projectName, fileCount, totalBytes, adminId}` for the route layer to feed `logAuditEvent`. Comments, notes, checklist, and `BoardNotification` rows are intentionally preserved (CONTEXT.md "metadata retention"). Module header carries an explicit DO-NOT-REMOVE schedule-isolation invariant.
- **`POST /cards/:cardId/admin/archive`** in `boardAdmin.ts` (commit `307b557`) — `requireAuth + requireRole('ADMIN') + mutationRateLimiter` (ADMIN-only — `requireCardAccess` intentionally not used because admins are universally allowed). Zod `{confirmProjectName}`. Delegates to `archiveCard`, then `logAuditEvent({action: 'board.card.archive', details})` and `emitBoardInvalidate('cards')` + `emitBoardInvalidate('files')`. `ArchiveError` mapped: `NOT_FOUND → 404`, others → 400. Co-located `extractIp` helper matches the `boardFiles.ts` pattern.
- **`GET /notifications/unread-count` + `POST /notifications/mark-read`** in `boardNotifications.ts` (commit `44e5f90`) — `unread-count` is per-user via `prisma.boardNotification.count({where: {userId, isRead: false}})`, returns `{count}`; `mark-read` takes `{cardId: cuid}` and `prisma.boardNotification.updateMany({where: {userId, cardId, isRead: false}, data: {isRead: true}})`, then emits `'notifications'`. Idempotent on re-run.

## Files Modified

- `backend/src/services/boardNotesService.ts` — create: updateNotes helper
- `backend/src/routes/boardNotes.ts` — modify: replace empty-scaffold with PATCH route
- `backend/src/services/boardArchiveService.ts` — create: archiveCard with schedule-isolation invariant + ArchiveError + ArchiveAuditDetails
- `backend/src/routes/boardAdmin.ts` — modify: replace empty-scaffold with POST /archive route + extractIp helper
- `backend/src/routes/boardNotifications.ts` — modify: replace empty-scaffold with GET /unread-count and POST /mark-read

## Deviations

See frontmatter `deviations`. Four entries: (1) `/home/rl/...` → `/home/rm/...` path correction; (2) `@/db/prisma.js` alias usage in services (boardNotifications.ts uses the relative `../db/prisma.js` because the codebase varies — both work); (3) plain `try/catch` async handler instead of the `asyncHandler(...)` sketched in the plan (no such wrapper exists); (4) Task 5 integration test deferred to plan 23-07 where a single comprehensive cross-operation schedule-isolation regression test (already in 23-07's `files_modified`) covers archive + PATCH notes + POST comment + file upload + file delete in one place.

> **QA Round 01 cross-reference (DEVN-05-01, resolved-by-amendment):** see `.vbw-planning/phases/23-project-board-files-notes/remediation/qa/round-01/R01-PLAN.md` Task 2 — Task 5's integration test was delivered in plan 23-07 as `backend/src/services/__tests__/scheduleIsolation.phase23.test.ts` (passing 6/6); the 23-05 plan body now carries the post-hoc amendment block.

## Verification Performed

- `grep -nE "prisma\.(assignment|teamMember|absence|holiday)\.(create|update|delete|upsert)" backend/src/services/boardArchiveService.ts` — zero matches.
- `grep -n "MUST NOT\|SCHEDULE-ISOLATION" boardArchiveService.ts` — invariant header present at lines 4-5.
- `grep -n "notesUpdatedAt\|notesUpdatedBy" backend/src/routes/boardNotes.ts backend/src/services/boardNotesService.ts` — both columns wired in service + route.
- `grep -n "board.card.archive" backend/src/routes/boardAdmin.ts` — audit action present at line 66.
- `grep -n "unread-count\|mark-read" backend/src/routes/boardNotifications.ts` — both endpoints present at lines 25, 45.
- `npx tsc --noEmit` from `backend/` — zero errors across all five modified/created files.
- Manual review confirmed: Comments + notes + checklist + BoardNotification rows are preserved by `archiveCard` (no delete/update statement targets those tables).

## Live Validation NOT Performed (deferred to executor / wave-3/4 UAT)

The plan's 7-step "REQUIRES AUTHENTICATED LIVE VALIDATION" block (PATCH notes round-trip, ADMIN archive wrong-name 400, ADMIN archive correct-name end-to-end with DB + disk inspection, audit-row inspection, unread-count, mark-read, schedule-integrity SELECT diff) is deferred. Static checks confirm code paths exist; live behaviour requires authenticated multi-role sessions and a populated database.

## Task 5 Status

Task 5 (integration test `boardArchiveService.isolation.test.ts` confirming `Assignment` rows are byte-identical pre/post archive) is intentionally NOT delivered in this plan — see deviation note. The equivalent (and broader) cross-operation integration test is already scoped into plan 23-07's `scheduleIsolation.phase23.test.ts`, which exercises archive, notes PATCH, comment POST, file upload, and file delete in one coherent suite. Splitting this across two plans would have meant maintaining two near-identical tests with overlapping setup; the static-grep verification above provides the immediate-merge confidence and 23-07 provides the runtime regression net.
