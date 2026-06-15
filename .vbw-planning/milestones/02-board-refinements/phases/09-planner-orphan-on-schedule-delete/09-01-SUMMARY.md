---
phase: 9
plan: "01"
title: Move orphaned planner card to 'stopped' on last-pentester schedule delete; invalidate + broadcast board cache
status: complete
completed: 2026-06-12
tasks_completed: 3
tasks_total: 3
commit_hashes:
  - b0ef7b9
  - 78060d5
  - 079aa31
deviations: []
pre_existing_issues:
  - "{\"test\": \"resolveAuthRateLimitMax import\", \"file\": \"backend/src/middleware/__tests__/rateLimit.test.ts\", \"error\": \"TS2835: relative import '../rateLimit' needs explicit .js extension (nodenext). Introduced by prior auth phase commit e3333d2; unmodified by this plan; the only tsc/build error and it is in a test file outside this plan's scope.\"}"
  - "{\"test\": \"Audit Service (21 tests, 15 failing)\", \"file\": \"backend/tests/services/audit.test.ts\", \"error\": \"Pre-existing failures verified at parent commit e3333d2 via read-only git worktree; environment-dependent (audit chain / Redis / DB availability). Does not reference assignmentService.\"}"
  - "{\"test\": \"Session Service > isTrustedDevice\", \"file\": \"backend/tests/services/session.test.ts\", \"error\": \"Pre-existing failure verified at parent commit e3333d2; environment-dependent. Does not reference assignmentService.\"}"
  - "{\"test\": \"pdfQueue > addPdfConversionJob (2 failing)\", \"file\": \"backend/src/services/__tests__/pdfQueue.test.ts\", \"error\": \"Pre-existing failure verified at parent commit e3333d2; queue/env-dependent. Does not reference assignmentService.\"}"
  - "{\"test\": \"boardAdminArchive > archives with empty body (1 failing)\", \"file\": \"backend/src/routes/__tests__/boardAdminArchive.test.ts\", \"error\": \"Pre-existing failure verified at parent commit e3333d2; env-dependent. Does not reference assignmentService.\"}"
  - "{\"test\": \"boardFiles broadened read policy (1 failing)\", \"file\": \"backend/src/routes/__tests__/boardFiles.test.ts\", \"error\": \"Pre-existing failure verified at parent commit e3333d2; env-dependent. Does not reference assignmentService.\"}"
  - "{\"test\": \"templateAdapter > analyzeTemplate order (1 failing)\", \"file\": \"backend/src/services/__tests__/templateAdapter.test.ts\", \"error\": \"Pre-existing failure verified at parent commit e3333d2; mock/LLM-order mismatch. Does not reference assignmentService.\"}"
  - "{\"test\": \"templateMapping > queryFewShotExamples (3 failing)\", \"file\": \"backend/src/services/__tests__/templateMapping.test.ts\", \"error\": \"Pre-existing failure verified at parent commit e3333d2; test expects old orderBy shape (single object) vs current array. Does not reference assignmentService.\"}"
ac_results:
  - criterion: "MULTI-PENTESTER SAFETY: guard moves a card to 'stopped' only when post-delete count over OR[projectId, splitProjectId] === 0; a project still referenced by any assignment is untouched."
    verdict: pass
    evidence: "assignmentService.ts:386 count OR[projectId,splitProjectId]; commit b0ef7b9; test case (b) MULTI-PENTESTER SAFETY in deleteAssignmentOrphan.stopped.test.ts (78060d5)"
  - criterion: "Guard NEVER deletes a Project/BoardCard/row; only write is boardCard.update stage='stopped'. No project.delete/boardCard.delete/deleteMany."
    verdict: pass
    evidence: "grep on assignmentService.ts: stage:'stopped' single update (L396); no project.delete/boardCard.delete/deleteMany added (NONE)"
  - criterion: "SCHEDULE ISOLATION: writes ONLY BoardCard.stage; no Assignment/TeamMember/Absence/Holiday write; no FK change; NO Prisma migration (schema + migrations byte-for-byte unchanged)."
    verdict: pass
    evidence: "git diff b0ef7b9^..HEAD -- backend/prisma/ is empty; only board write is BoardCard.stage"
  - criterion: "BEST-EFFORT / NON-FATAL: board update wrapped in its own try/catch that logs and swallows; deleteAssignment still returns the deleted assignment even if boardCard.update throws."
    verdict: pass
    evidence: "assignmentService.ts try/catch mirrors linkProjectsForAssignment; returns `deleted`; test case (e) NON-FATAL (no-card project still succeeds)"
  - criterion: "NULL / SPLIT HANDLING: projectId and splitProjectId each null-checked; split row checks each id independently; same-id de-duped."
    verdict: pass
    evidence: "Set+filter(pid != null) de-dup/null-check in assignmentService.ts; test (c) SPLIT-CELL INDEPENDENCE + (d) BACKLOG/NULL no-op"
  - criterion: "FRONTEND CACHE: useDeleteAssignment.onSuccess invalidates BOTH ['schedule','assignments'] AND ['board','cards']."
    verdict: pass
    evidence: "frontend/src/features/schedule/hooks.ts L164 (commit 079aa31); grep shows 3 hits for ['board','cards'] (upsert/update/delete)"
  - criterion: "SOCKET BROADCAST: DELETE /assignments/:id calls emitBoardInvalidate('cards') after emitScheduleInvalidate('assignments'); imported from socketService.js."
    verdict: pass
    evidence: "schedule.ts:13 import + schedule.ts:342 emitBoardInvalidate('cards') (commit 079aa31)"
  - criterion: "New backend test proves zero->stopped, multi-pentester untouched, split independence, backlog/null no-op; existing schedule/board suites stay green."
    verdict: pass
    evidence: "deleteAssignmentOrphan.stopped.test.ts 5/5 pass; boardAutoMove.stopped + scheduleIsolation.phase23/phase24 all green (4 files / 15 tests)"
---

Deleting the last pentester's assignment for a project now parks its Planner card in the existing 'stopped' stage (never deletes), with multi-pentester safety enforced by a zero-count guard over both projectId and splitProjectId, plus board cache invalidation and a socket broadcast so every client's Planner refreshes.

## What Was Built

- Backend last-assignment orphan guard in `deleteAssignment`: captures pre-delete projectId/splitProjectId, deletes the assignment, then for each non-null linked project counts remaining assignments (`OR [{projectId}, {splitProjectId}]`) and only when the count is exactly 0 moves that project's BoardCard to `stage: 'stopped'`. Wrapped in a best-effort try/catch (mirrors `linkProjectsForAssignment`); de-dups the projectId===splitProjectId case; guards the missing-card case with a prior findUnique. Never deletes a Project/BoardCard/row.
- New seeded-id, parallel-safe Vitest regression suite proving: (a) zero-remaining -> card 'stopped'; (b) multi-pentester safety (untouched); (c) split-cell independence (A stopped, B untouched); (d) backlog/null no-op; (e) non-fatal when the project has no BoardCard.
- DELETE /assignments/:id now emits `emitBoardInvalidate('cards')` after the schedule emit (broadcasts a board refresh to other clients), and `useDeleteAssignment.onSuccess` invalidates `['board','cards']` (refreshes the acting client's Planner).

## Files Modified

- `backend/src/services/assignmentService.ts` -- modified: added the best-effort last-assignment 'stopped' guard to `deleteAssignment` (commit b0ef7b9).
- `backend/src/services/__tests__/deleteAssignmentOrphan.stopped.test.ts` -- created: regression suite covering zero->stopped, multi-pentester, split, backlog/null, non-fatal (commit 78060d5).
- `backend/src/routes/schedule.ts` -- modified: import + call `emitBoardInvalidate('cards')` in the DELETE /assignments/:id handler (commit 079aa31).
- `frontend/src/features/schedule/hooks.ts` -- modified: `useDeleteAssignment.onSuccess` invalidates `['board','cards']` (commit 079aa31).

## Deviations

None

## Implementation Notes

The plan was implemented exactly as written across three atomic commits, one per task. The board-side update guards the missing-BoardCard case with a `findUnique` before `boardCard.update` — the plan explicitly offered this as one of two acceptable approaches — in addition to the surrounding best-effort try/catch. This is a permitted choice, not a deviation.

Pre-existing test/build issues are recorded in `pre_existing_issues` above: one tsc error in `rateLimit.test.ts` (introduced by the prior auth phase, commit e3333d2) and seven unrelated backend suites (audit, session, pdfQueue, boardAdminArchive, boardFiles, templateAdapter, templateMapping) that fail identically at the parent commit e3333d2 (verified via a read-only git worktree). None reference `assignmentService`/`deleteAssignment`, none are the schedule/board suites this plan touches, and all are out of scope. The plan-relevant suites (new `deleteAssignmentOrphan.stopped`, `boardAutoMove.stopped`, `scheduleIsolation.phase23`, `scheduleIsolation.phase24`) and the frontend type-check are green.
