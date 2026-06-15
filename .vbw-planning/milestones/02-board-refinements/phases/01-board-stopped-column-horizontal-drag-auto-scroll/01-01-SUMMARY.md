---
phase: 1
plan: "01-01"
title: Stopped Column & Horizontal Drag Auto-Scroll
status: complete
completed: 2026-06-03
tasks_completed: 4
tasks_total: 4
commit_hashes:
  - 09b2572
  - e821b4f
  - 37fd3d4
  - 968c34d
deviations: []
pre_existing_issues:
  - "{\"test\": \"pdfQueue > addPdfConversionJob > should reject an invalid file path / should reject an empty file path\", \"file\": \"backend/src/services/__tests__/pdfQueue.test.ts\", \"error\": \"expected error including 'Invalid DOCX path' but got 'Invalid source file path: ...' — stale expected error-message string; reproduces in isolation; file not touched by this plan\"}"
  - "{\"test\": \"templateMapping > queryFewShotExamples > (sorted by usageCount DESC / filters by templateType+language / respects limit)\", \"file\": \"backend/src/services/__tests__/templateMapping.test.ts\", \"error\": \"expected vi.fn() to be called with arguments [...] — stale mock expectation; reproduces in isolation; file not touched by this plan\"}"
  - "{\"test\": \"templateAdapter > analyzeTemplate > calls Python service and LLM in correct order\", \"file\": \"backend/src/services/__tests__/templateAdapter.test.ts\", \"error\": \"expected vi.fn() to be called with arguments [...] — stale mock expectation; reproduces in isolation; file not touched by this plan\"}"
  - "{\"test\": \"scheduleIsolation.phase23/phase24 + audit/session services (concurrent run only)\", \"file\": \"backend/src/services/__tests__/scheduleIsolation.phase24.test.ts\", \"error\": \"SQLite single-writer 'Operation has timed out' / 'database is locked' under concurrent vitest workers — documented known-issue (STATE.md), passes in isolation; not caused by this plan\"}"
ac_results:
  - criterion: "'stopped' is a member of BoardStage and the FIRST entry of BOARD_STAGES (display order: stopped, upcoming, preparation, execution, closing, done)."
    verdict: pass
    evidence: "frontend/src/features/board/types.ts:9,111 (commit e821b4f)"
  - criterion: "Stopped is an always-visible normal column (in BOARD_STAGES), NOT toggle-gated like archived."
    verdict: pass
    evidence: "BOARD_STAGES front-inserts 'stopped'; archived remains toggle-appended in Board.tsx (types.ts:111, e821b4f)"
  - criterion: "Backend StageEnum accepts 'stopped'; PATCH /cards/:id with stage='stopped' validates; an invalid stage returns 400."
    verdict: pass
    evidence: "backend/src/routes/board.ts:16 z.enum includes 'stopped'; invalid value rejected by zod → 400 (commit 09b2572)"
  - criterion: "autoMoveCards() never moves a card with stage='stopped' (excluded by where clause), and never moves a card TO 'stopped'."
    verdict: pass
    evidence: "boardService.ts:227 notIn ['archived','stopped']; targetStage only sets upcoming/preparation; test boardAutoMove.stopped.test.ts (commit 968c34d)"
  - criterion: "DndContext horizontal-only auto-scroll: threshold {x:0.2,y:0}; vertical auto-scroll suppressed; normal (non-drag) horizontal scroll unaffected."
    verdict: pass
    evidence: "frontend/src/routes/Board.tsx:274 autoScroll={{ threshold: { x: 0.2, y: 0 } }} (commit 37fd3d4); manual/UAT verification deferred"
  - criterion: "NO Prisma migration is created or run; schema.prisma change is the valid-values comment only."
    verdict: pass
    evidence: "git status backend/prisma/migrations/ clean; schema.prisma:321 comment-only change, stage stays String @default (commit 09b2572)"
  - criterion: "Schedule isolation preserved: no reads-as-writes or writes to Assignment/TeamMember/Absence/Holiday from any board code touched here."
    verdict: pass
    evidence: "grep on boardService.ts/board.ts shows no schedule-table mutations; autoMoveCards only updates boardCard; include block is read-only select weekStart"
---

Added an always-visible 'Stopped' board stage (first in display order) wired consistently through the frontend stage model, backend stage validation, and the date-based auto-mover (which now excludes Stopped cards), plus horizontal-only drag auto-scroll on the board DnD context — all with no DB migration and schedule isolation preserved.

## What Was Built

- Backend `StageEnum` accepts `'stopped'` (covers GET filter + PATCH body); invalid stages still 400. No new permission guard (any user may move a card to Stopped).
- `autoMoveCards()` where clause changed to `stage: { notIn: ['archived', 'stopped'] }` so the date-based mover never reasons about a Stopped card; it never targets 'stopped' (only upcoming/preparation).
- `schema.prisma` BoardCard.stage valid-values doc comment updated to list `stopped` first; `stage` stays a plain `String @default("upcoming")` — no migration created or run.
- Frontend stage model: `'stopped'` added to `BoardStage`, front-inserted into `BOARD_STAGES`, `stopped: 'Stopped'` in `STAGE_LABELS`, and `stopped: []` in the `groupCardsByStage` initializer (Record exhaustiveness satisfied; build green).
- Board `<DndContext>` gets `autoScroll={{ threshold: { x: 0.2, y: 0 } }}` — horizontal-only drag auto-scroll; vertical suppressed; non-drag scroll unaffected.
- New vitest regression `boardAutoMove.stopped.test.ts`: a stage='stopped' card whose week qualifies for auto-move stays Stopped; a non-stopped control card moves to 'preparation' (non-vacuous). Scoped seed/cleanup with a SQLite-concurrency retry wrapper.

## Files Modified

- `backend/src/routes/board.ts` -- edit: add 'stopped' to StageEnum
- `backend/src/services/boardService.ts` -- edit: autoMoveCards where clause excludes ['archived','stopped']
- `backend/prisma/schema.prisma` -- edit: update BoardCard.stage valid-values doc comment (no migration)
- `frontend/src/features/board/types.ts` -- edit: add 'stopped' to BoardStage, BOARD_STAGES, STAGE_LABELS, groupCardsByStage
- `frontend/src/routes/Board.tsx` -- edit: horizontal-only autoScroll on DndContext
- `backend/src/services/__tests__/boardAutoMove.stopped.test.ts` -- new: regression test that autoMoveCards skips Stopped cards

## Implementation Notes

DEVN-01 — **resolved-by-amendment (R01-QA, commit dcc1912).** The new test wraps its DB
writes in a test-only `withDbRetry` backoff helper to absorb SQLite single-writer lock
timeouts under concurrent vitest workers, matching the established `upsertAssignmentWithRetry`
pattern in the scheduleIsolation suites. The original `01-01-PLAN.md` task action did not
explicitly specify the wrapper; it was recorded there via QA-remediation plan amendment and
re-verified PASS (`remediation/qa/round-01/R01-VERIFICATION.md`). No product code was changed
for this; the helper is test-only (grep outside `__tests__` is empty), and the test is stable
in isolation (5/5) and within the full `src/` suite. No longer an open deviation.

## Pre-existing Issues

The full backend `npm test` run surfaced failures unrelated to this plan (none in files this plan touched). All reproduce independently of board/stage code:

- `pdfQueue.test.ts` (2 tests) — stale expected error-message string ('Invalid DOCX path' vs actual 'Invalid source file path: ...'). Reproduces in isolation.
- `templateMapping.test.ts` (3 tests) — stale `vi.fn()` mock-call-argument expectations. Reproduces in isolation.
- `templateAdapter.test.ts` (1 test) — stale `vi.fn()` mock expectation. Reproduces in isolation.
- `scheduleIsolation.phase23/phase24` + `audit`/`session` — SQLite single-writer "Operation has timed out" / "database is locked" failures that only appear under concurrent vitest workers; documented known-issue (STATE.md). Pass in isolation.

Note: vitest also discovers stale compiled copies under the git-ignored `backend/dist/` (produced by `npm run build`), running each test twice concurrently and amplifying the SQLite contention — orthogonal to this plan. None of the above are fixed here (out of scope).
