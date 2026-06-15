---
phase: 2
plan: "02-01"
title: Archive Without Typed Project-Name Confirmation
status: complete
completed: 2026-06-03
tasks_completed: 3
tasks_total: 3
commit_hashes:
  - a9a518b
  - 88403f8
  - 088faa6
deviations: []
pre_existing_issues: []
ac_results:
  - criterion: "archiveCard() signature is (cardId, adminUserId); confirmProjectName removed; all call sites updated in the same commit so tsc stays green."
    verdict: pass
    evidence: "a9a518b — boardArchiveService.ts:51 two-arg; boardAdmin.ts:56 + scheduleIsolation.phase23.test.ts:245,268 call sites; backend tsc green"
  - criterion: "ArchiveErrorCode union is exactly 'NOT_FOUND' (PROJECT_NAME_MISMATCH removed); mismatch check + throw gone from the service."
    verdict: pass
    evidence: "a9a518b — boardArchiveService.ts:20 `export type ArchiveErrorCode = 'NOT_FOUND';`; grep PROJECT_NAME_MISMATCH empty"
  - criterion: "POST /cards/:cardId/admin/archive accepts an empty body and archives; non-existent card returns 404 { error: 'NOT_FOUND' }."
    verdict: pass
    evidence: "088faa6 — boardAdminArchive.test.ts both assertions pass (200 empty-body archive; 404 NOT_FOUND)"
  - criterion: "Archive route remains behind requireAuth + requireRole('ADMIN') + mutationRateLimiter; destructive behavior unchanged (hard-delete files, stage=archived, audit event with projectName from card.project.name)."
    verdict: pass
    evidence: "a9a518b — boardAdmin.ts middleware + logAuditEvent unchanged; service hard-delete + stage='archived' + projectName return unchanged; route test asserts files hard-deleted on disk + stage='archived'"
  - criterion: "SCHEDULE-ISOLATION INVARIANT preserved and JSDoc present/accurate: only read-only project:{select:{name:true}} join remains; no writes to Assignment/TeamMember/Absence/Holiday."
    verdict: pass
    evidence: "a9a518b — boardArchiveService.ts JSDoc block present (now 'for the audit log'); project name join retained; no schedule prisma calls"
  - criterion: "ArchiveCardDialog no longer has a typed-name input/Label/help-text/form or matches/typed/error state; Archive enabled subject only to archive.isPending; Archive/Cancel confirm + file-summary warning remain."
    verdict: pass
    evidence: "88403f8 — ArchiveCardDialog.tsx: form/Input/Label/state removed, no React hooks; disabled={archive.isPending}; fileSummary + AlertDialog shell retained"
  - criterion: "projectName prop removed from ArchiveCardDialogProps and the CardDetailModal call site; api.ts/hooks.ts no longer send or type confirmProjectName."
    verdict: pass
    evidence: "88403f8 — interface + CardDetailModal.tsx:664 call site dropped projectName; api.archiveCard(cardId) sends {}; useArchiveCard takes { cardId } only"
  - criterion: "No Prisma migration is created or run."
    verdict: pass
    evidence: "git status --porcelain backend/prisma/migrations/ empty across all three commits; no forbidden prisma command run"
---

Removed the typed-project-name confirmation gate from the admin archive flow end to end (UI dialog input + backend confirmProjectName) while keeping a lightweight Archive/Cancel confirm; schedule isolation and the audit projectName read are preserved, with no DB migration.

## What Was Built

- Backend: `archiveCard()` is now two-arg `(cardId, adminUserId)`; `ArchiveErrorCode` narrowed to `'NOT_FOUND'`; the project-name mismatch check + throw removed. Route drops the Zod body parse / ZodError branch / unused `z` import, accepts an empty body, and maps `NOT_FOUND`→404. The read-only `project:{select:{name:true}}` join and the SCHEDULE-ISOLATION INVARIANT JSDoc are preserved (join now feeds only the audit `projectName`).
- Frontend: `ArchiveCardDialog` lost the typed-name input/Label/help/form, all React hooks and `typed`/`error`/`matches` state, and the `projectName` prop; the Archive button is gated only by `archive.isPending`, and the Archive/Cancel confirm + file hard-delete warning remain. `api.archiveCard(cardId)` sends an empty JSON body; `useArchiveCard` passes `{ cardId }` with no `PROJECT_NAME_MISMATCH` branch; the `CardDetailModal` call site dropped `projectName`.
- Backend test: new route-level regression `boardAdminArchive.test.ts` mounts the real router behind `requireAuth + requireRole('ADMIN') + mutationRateLimiter` and asserts empty-body archive → 200 (files hard-deleted, stage='archived') and missing card → 404 NOT_FOUND; the coupled `scheduleIsolation.phase23` test updated to the two-arg call.

## Files Modified

- `backend/src/services/boardArchiveService.ts` -- edited: two-arg signature, NOT_FOUND-only error code, mismatch check removed, JSDoc updated, schedule-isolation join + invariant preserved
- `backend/src/routes/boardAdmin.ts` -- edited: removed Zod body parse + ZodError branch + `z` import, NOT_FOUND→404, empty-body accepted, JSDoc updated
- `backend/src/services/__tests__/scheduleIsolation.phase23.test.ts` -- edited: two-arg archiveCard calls; orphan `assignment` fetch removed from matrix test; defence-in-depth assertion kept
- `frontend/src/features/board/components/ArchiveCardDialog.tsx` -- edited: typed-name gate/state/imports removed; lightweight Archive/Cancel confirm retained
- `frontend/src/features/board/api.ts` -- edited: `archiveCard(cardId)` sends `{}`; confirmProjectName dropped
- `frontend/src/features/board/hooks.ts` -- edited: `useArchiveCard` takes `{ cardId }`; PROJECT_NAME_MISMATCH branch removed
- `frontend/src/features/board/components/CardDetailModal.tsx` -- edited: dropped `projectName` prop from the ArchiveCardDialog call site
- `backend/src/routes/__tests__/boardAdminArchive.test.ts` -- created: route-level regression (empty-body archive 200, missing card 404 NOT_FOUND); schedule-isolation-safe seed + try/finally cleanup + withDbRetry backoff

## Deviations

None.
