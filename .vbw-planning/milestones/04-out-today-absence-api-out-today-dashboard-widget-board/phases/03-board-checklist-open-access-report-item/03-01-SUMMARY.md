---
phase: 3
plan: "01"
title: Board checklist open access + default Report-share item
status: complete
completed: 2026-07-02
tasks_completed: 4
tasks_total: 4
commit_hashes:
  - ad816c6
  - d798d66
  - 4251f4d
  - f7850dc
deviations:
  - "DEVN-02: the plan placed the pure `backfillChecklist` transform inside backend/scripts/backfill-checklist-report-share-item.ts and had the test import it directly from there. The repo tsconfig sets rootDir=src, so a src/** test importing a scripts/**.ts file fails the mandatory `tsc --noEmit` gate with TS6059. Resolved by defining the pure `backfillChecklist` + `NEW_ITEM_LABEL` in backend/src/services/boardService.ts (an allowed_paths module that already owns DEFAULT_CHECKLIST and checklist serialization); the backfill script imports and re-exports them and still owns the entrypoint-guarded main(); both tests import them from boardService. All behavioral must_haves and pure-function testability are preserved."
  - "DEVN-01 (minor): Task 4 commit also includes the small edits to boardService.ts and the backfill script (relocating/re-exporting the transform) because the tests cannot compile without them — the enabling refactor is bundled with the test task it unblocks."
pre_existing_issues:
  - "{\"test\": \"boardFiles routes — Phase 3 broadened read policy > (b) lets a non-assigned NORMAL user download a file → 200\", \"file\": \"backend/src/routes/__tests__/boardFiles.test.ts\", \"error\": \"Fails only under the combined parallel-worker run (SQLite single-writer + filesystem contention); passes 8/8 when run in isolation. Not caused by this plan's changes (filesRouter untouched).\"}"
  - "{\"test\": \"pdfQueue > addPdfConversionJob > should reject an invalid file path\", \"file\": \"backend/src/services/__tests__/pdfQueue.test.ts\", \"error\": \"Env-dependent PDF-queue suite (external/Redis-backed); unrelated to board checklist changes.\"}"
  - "{\"test\": \"pdfQueue > addPdfConversionJob > should reject an empty file path\", \"file\": \"backend/src/services/__tests__/pdfQueue.test.ts\", \"error\": \"Env-dependent PDF-queue suite (external/Redis-backed); unrelated to board checklist changes.\"}"
  - "{\"test\": \"templateAdapter service > analyzeTemplate > calls Python service and LLM in correct order\", \"file\": \"backend/src/services/__tests__/templateAdapter.test.ts\", \"error\": \"Env-dependent template-AI suite (needs Python sanitization service / LLM); unrelated to board checklist changes.\"}"
  - "{\"test\": \"templateMapping service > queryFewShotExamples > returns entries sorted by usageCount DESC\", \"file\": \"backend/src/services/__tests__/templateMapping.test.ts\", \"error\": \"Env-dependent template-mapping suite; unrelated to board checklist changes.\"}"
  - "{\"test\": \"templateMapping service > queryFewShotExamples > filters by templateType and language correctly\", \"file\": \"backend/src/services/__tests__/templateMapping.test.ts\", \"error\": \"Env-dependent template-mapping suite; unrelated to board checklist changes.\"}"
  - "{\"test\": \"templateMapping service > queryFewShotExamples > respects limit parameter\", \"file\": \"backend/src/services/__tests__/templateMapping.test.ts\", \"error\": \"Env-dependent template-mapping suite; unrelated to board checklist changes.\"}"
ac_results:
  - criterion: "A checklist-only PATCH body from ANY authenticated user (incl. unassigned NORMAL) returns 200 and persists the checklist; the ownership 403 is skipped only on this path."
    verdict: pass
    evidence: "board.ts checklistOnly predicate (ad816c6); boardPatchChecklistAccess.test.ts cases (1)/(6)/(7) green (f7850dc)."
  - criterion: "A non-owner NORMAL PATCH with stage, stageLockedBy, stage='archived', OR a mixed checklist+other-field body still returns 403; a mixed checklist+stage body leaves the stored checklist UNCHANGED."
    verdict: pass
    evidence: "boardPatchChecklistAccess.test.ts cases (2)/(3)/(4)/(5); case (4) asserts the stored checklist equals BASELINE after the 403."
  - criterion: "Phase 11 ADMIN-only archive guard (board.ts) and PM/ADMIN-only stageLockedBy guard are byte-for-byte unchanged; assigned NORMAL/PM/ADMIN checklist edits still 200."
    verdict: pass
    evidence: "grep confirms 'Only ADMIN can archive cards' + 'Only PM or ADMIN can change stage lock' unchanged; test cases (5)/(6)/(7)."
  - criterion: "DEFAULT_CHECKLIST ends with { label: \"Report is on client's share\", checked: false, order: 6 } as its 7th/last entry; first six (order 0-5) unchanged."
    verdict: pass
    evidence: "boardService.ts (d798d66); defaultChecklistBackfill.test.ts DEFAULT_CHECKLIST length/last-entry + first-six assertions."
  - criterion: "The backfill core is a pure exported function: idempotent (exact-label), missing item added at max(order)+1, empty/malformed JSON treated as [] and added at order 0."
    verdict: pass
    evidence: "backfillChecklist in boardService.ts, re-exported by the backfill script; defaultChecklistBackfill.test.ts suite (B) covers idempotency/ordering/malformed/empty/non-array."
  - criterion: "No frontend files and no Prisma schema/migration files are modified; BoardCard.checklist stays free-form JSON-in-TEXT."
    verdict: pass
    evidence: "git diff 2704268..HEAD touches only backend/src + backend/scripts; no frontend/ or backend/prisma/ paths."
  - criterion: "artifact backend/src/routes/board.ts contains 'checklistOnly'"
    verdict: pass
    evidence: "grep -c checklistOnly board.ts = 3 (ad816c6)."
  - criterion: "artifact backend/src/services/boardService.ts contains 'Report is on client's share'"
    verdict: pass
    evidence: "DEFAULT_CHECKLIST literal + NEW_ITEM_LABEL (d798d66/f7850dc)."
  - criterion: "artifact backend/scripts/backfill-checklist-report-share-item.ts contains 'Report is on client's share'"
    verdict: pass
    evidence: "script doc-comment states the item label; NEW_ITEM_LABEL re-exported (4251f4d/f7850dc)."
  - criterion: "artifact boardPatchChecklistAccess.test.ts contains 'unassigned'; defaultChecklistBackfill.test.ts contains 'idempot'"
    verdict: pass
    evidence: "both literals present in the new test files (f7850dc)."
  - criterion: "key_link: script main() calls the pure transform per card; the same function is imported by the test."
    verdict: pass
    evidence: "script main() calls backfillChecklist per BoardCard; the test imports the same backfillChecklist. Canonical definition relocated to boardService (re-exported by the script) — see DEVN-02."
  - criterion: "key_link: test imports the exported pure transform (no DB, no main() side effects)."
    verdict: partial
    evidence: "Satisfied via boardService import (the transform's tsc-legal home; the script re-exports it) rather than importing the scripts/ file directly, because rootDir=src forbids the direct import — see DEVN-02. No DB/main() side effects are pulled in."
  - criterion: "key_link: projectService.upsertByKey serializes DEFAULT_CHECKLIST into new BoardCard.checklist."
    verdict: pass
    evidence: "defaultChecklistBackfill.test.ts upsertByKey test: created card's parsed checklist has 7 entries ending with the report-share item at order 6."
---

Backend-only Phase 03: opened board checklist edits to every authenticated user (checklist-only PATCH bypasses the ownership 403 while all other fields keep their gating) and added a default `Report is on client's share` checklist item to new cards plus an idempotent backfill for existing ones.

## What Was Built

- `PATCH /cards/:id` per-field authz: a body whose keys are exactly `['checklist']` skips the assignment-ownership check; any other field (stage/notes/stageLockedBy), alone or mixed with checklist, still hits ownership + the PM/ADMIN stage-lock guard, and a mixed body is rejected wholesale. The Phase 11 ADMIN-only archive guard is untouched.
- `DEFAULT_CHECKLIST` now ends with `{ label: "Report is on client's share", checked: false, order: 6 }`, so every card created via `projectService.upsertByKey` includes it.
- A pure, exported `backfillChecklist()` transform (idempotent exact-label match, `max(order)+1` ordering, malformed/empty/non-array JSON → `[]`) and a one-off `npx tsx` backfill script that drives it over every BoardCard via an entrypoint-guarded `main()` (not wired into package.json).
- Two test suites: an 8-case PATCH access matrix (incl. the mixed-body "checklist unchanged on 403" case and a schedule-isolation guard) and a default/backfill suite (DEFAULT_CHECKLIST shape, upsertByKey propagation, backfill idempotency/ordering/malformed-JSON). All 17 new tests green; `tsc --noEmit` clean.

## Files Modified

- `backend/src/routes/board.ts` -- edit: `checklistOnly` bypass inside the `if (!isManager)` branch of `PATCH /cards/:id`.
- `backend/src/services/boardService.ts` -- edit: appended the report-share default item to `DEFAULT_CHECKLIST`; added the exported pure `backfillChecklist()` + `NEW_ITEM_LABEL`.
- `backend/scripts/backfill-checklist-report-share-item.ts` -- new: idempotent one-off backfill; imports/re-exports the pure transform, entrypoint-guarded `main()`.
- `backend/src/routes/__tests__/boardPatchChecklistAccess.test.ts` -- new: 8-case checklist access matrix.
- `backend/src/services/__tests__/defaultChecklistBackfill.test.ts` -- new: DEFAULT_CHECKLIST + upsert propagation + backfill transform tests.

## Deviations

DEVN-02 — the pure backfill transform was moved from the scripts/ file into `boardService.ts` (re-exported by the script) so a `src/**` test can import it without tripping `tsc` rootDir=src (TS6059). Behavior and testability are unchanged. The Task 4 commit therefore also carries the small boardService/script edits that unblock the tests (DEVN-01). The one-time operational backfill run (`npx tsx backend/scripts/backfill-checklist-report-share-item.ts`) against the live DB is intentionally NOT executed here — it is a data step recorded in the plan's verification section, exercised only via the pure-function unit tests.
