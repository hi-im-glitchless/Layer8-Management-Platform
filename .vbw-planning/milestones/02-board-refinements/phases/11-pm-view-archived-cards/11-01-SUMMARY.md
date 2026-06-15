---
phase: 11
plan: "01"
title: PM Role — View & Open Archived Cards (Archive Stays ADMIN-Only)
status: complete
completed: 2026-06-15
tasks_completed: 3
tasks_total: 3
commit_hashes:
  - ebc64e8
  - 5f55f81
  - 354f32f
deviations: []
files_modified:
  - frontend/src/features/board/components/BoardFilters.tsx
  - backend/src/routes/board.ts
  - backend/src/routes/__tests__/boardPatchArchiveGuard.test.ts
pre_existing_issues:
  - "{\"test\": \"tests/services/audit.test.ts (Audit Service: logAuditEvent / verifyAuditChain / queryAuditLogs / exportAuditLogs / concurrent writes)\", \"file\": \"backend/tests/services/audit.test.ts\", \"error\": \"Unique constraint failed on the fields: (`username`) / SocketTimeout — shared single-writer dev.db seed collisions under parallel vitest workers; unmodified file\"}"
  - "{\"test\": \"tests/services/session.test.ts (isTrustedDevice: should return true for valid trusted device)\", \"file\": \"backend/tests/services/session.test.ts\", \"error\": \"AssertionError: expected false to be true — env/concurrency-dependent; unmodified file\"}"
  - "{\"test\": \"src/services/__tests__/pdfQueue.test.ts (addPdfConversionJob: should reject an invalid/empty file path)\", \"file\": \"backend/src/services/__tests__/pdfQueue.test.ts\", \"error\": \"AssertionError: expected throw including 'Invalid DOCX path' but got 'Invalid source file path:' — pre-existing message divergence; unmodified file\"}"
  - "{\"test\": \"src/services/__tests__/templateAdapter.test.ts (analyzeTemplate: calls Python service and LLM in correct order)\", \"file\": \"backend/src/services/__tests__/templateAdapter.test.ts\", \"error\": \"AssertionError: expected vi.fn() to be called with arguments — Python/LLM-dependent mock expectation; unmodified file\"}"
  - "{\"test\": \"src/services/__tests__/templateMapping.test.ts (queryFewShotExamples: sorted DESC / filters by templateType+language / respects limit)\", \"file\": \"backend/src/services/__tests__/templateMapping.test.ts\", \"error\": \"AssertionError on ordering/filter — env-dependent fixture data; unmodified file\"}"
  - "{\"test\": \"src/routes/__tests__/boardFiles.test.ts (Phase 3 broadened read policy: lets a non-assigned NORMAL user download a file -> 200)\", \"file\": \"backend/src/routes/__tests__/boardFiles.test.ts\", \"error\": \"AssertionError: expected 500 to be 200 — shared-DB/concurrency artifact; unmodified file\"}"
  - "{\"test\": \"src/routes/__tests__/boardAdminArchive.test.ts (archives the card with an empty body and a valid ADMIN session -> 200)\", \"file\": \"backend/src/routes/__tests__/boardAdminArchive.test.ts\", \"error\": \"Passes in isolation; flakes only under full-suite parallel SQLite contention (SocketTimeout / shared dev.db) — adjacent reference test, unmodified by this plan\"}"
  - "{\"test\": \"dist/** compiled duplicates of the above suites\", \"file\": \"backend/dist/(routes|services)/__tests__/*.test.js\", \"error\": \"Stale compiled test copies re-run alongside src/ versions, doubling shared-DB seed contention — pre-existing build artifact, not part of this plan\"}"
  - "{\"test\": \"src/middleware/__tests__/rateLimit.test.ts (tsc compile)\", \"file\": \"backend/src/middleware/__tests__/rateLimit.test.ts\", \"error\": \"TS2835: Relative import needs explicit .js extension ('../rateLimit.js') under nodenext — pre-existing tsc error in unmodified file\"}"
ac_results:
  - criterion: "PM (and ADMIN) can reveal archived cards: BoardFilters 'Show Archived' toggle gated by hasRole('PM'); NORMAL never sees it"
    verdict: "pass"
    evidence: "ebc64e8 — BoardFilters.tsx L98 hasRole('PM'); >= hierarchy in rbac.ts passes PM(2)/ADMIN(3), excludes NORMAL(1); frontend vitest green (29 passed)"
  - criterion: "Archive stays ADMIN-only: POST /cards/:id/admin/archive keeps requireRole('ADMIN') and CardDetailModal canArchive stays role==='ADMIN' — neither touched"
    verdict: "pass"
    evidence: "git diff HEAD~3 touches only BoardFilters.tsx, board.ts, new test; boardAdmin.ts and CardDetailModal.tsx unchanged"
  - criterion: "Drag-to-archive hole closed: PATCH /cards/:id rejects stage='archived' for PM (and NORMAL) with 403; only ADMIN may set stage='archived'; non-archived PATCH still works for PM"
    verdict: "pass"
    evidence: "5f55f81 — board.ts L120 'if (data.stage === archived && role !== ADMIN) return 403'; 354f32f boardPatchArchiveGuard.test.ts (3 tests pass: PM 403, ADMIN 200, PM non-archived 200)"
  - criterion: "No destructive/mutating endpoint widened to PM: admin-archive, card DELETE, file hard-delete, restore guards unchanged"
    verdict: "pass"
    evidence: "board.ts DELETE guard (requireRole('ADMIN')) and boardAdmin.ts untouched in git diff; only the archive-by-stage check was tightened (narrowed, not widened)"
  - criterion: "No backend read-guard change; no Prisma migration; no schedule (Assignment/TeamMember/Absence/Holiday) writes"
    verdict: "pass"
    evidence: "GET guards in board.ts/boardFiles.ts unchanged; git diff of schema.prisma + migrations empty; new test seeds only User/Project/BoardCard"
  - criterion: "artifact BoardFilters.tsx contains hasRole('PM')"
    verdict: "pass"
    evidence: "grep BoardFilters.tsx L98: {hasRole('PM') && ("
  - criterion: "artifact board.ts contains 'Only ADMIN can archive cards'"
    verdict: "pass"
    evidence: "board.ts L121 returns { error: 'Only ADMIN can archive cards' }"
  - criterion: "artifact boardPatchArchiveGuard.test.ts contains stage: 'archived'"
    verdict: "pass"
    evidence: "test body asserts PATCH body { stage: 'archived' } for PM(403) and ADMIN(200)"
---

PM (and ADMIN) can now reveal and open archived cards via the Show Archived toggle while archiving — including the drag-to-archive PATCH path — is locked to ADMIN only.

## What Was Built

- Widened the BoardFilters "Show Archived" toggle gate from `hasRole('ADMIN')` to `hasRole('PM')` so PM and ADMIN see/reveal the Archived column (NORMAL still excluded via the >= role hierarchy); no backend read change needed.
- Closed the PM drag-to-archive hole in `PATCH /cards/:id`: a single ADMIN-only guard now rejects `stage='archived'` for any non-ADMIN role with 403 before the `!isManager` branch; removed the redundant nested archive check and updated the doc comment.
- Added `boardPatchArchiveGuard.test.ts` (route-level, schedule-isolated) locking in PM 403 / ADMIN 200 / PM non-archived 200.

## Files Modified

- `frontend/src/features/board/components/BoardFilters.tsx` -- edited: toggle visibility guard `hasRole('ADMIN')` → `hasRole('PM')`.
- `backend/src/routes/board.ts` -- edited: single ADMIN-only archive-by-stage guard in PATCH handler; redundant nested check removed; doc comment updated.
- `backend/src/routes/__tests__/boardPatchArchiveGuard.test.ts` -- added: PM-cannot-archive / ADMIN-can route regression test.

## Deviations

None

## Notes

- Verification: frontend `npx vitest run` green (29 passed); frontend `tsc --noEmit` clean. New backend suite `boardPatchArchiveGuard.test.ts` passes (3/3) both in isolation and within the full run; adjacent `boardAdminArchive.test.ts` passes in isolation. Backend `tsc` reports no errors on `board.ts` (only the pre-existing `rateLimit.test.ts` TS2835).
- Pre-existing failures (DEVN-05, not fixed — out of scope): the full backend `vitest run` shows 34 failures across audit/session/pdfQueue/templateAdapter/templateMapping/boardFiles and a full-suite-only flake of boardAdminArchive. These stem from the shared single-writer dev.db under parallel vitest workers (Unique-constraint username collisions, SocketTimeout), Python/LLM/Redis-dependent service tests, and stale compiled `dist/**` test duplicates re-running alongside `src/`. None are in files this plan modified; the env/mock backend suites and the `rateLimit.test.ts` TS2835 are the known pre-existing set. See `pre_existing_issues` frontmatter for the itemised list.
- No Prisma migration, no schema change, no schedule writes (`git diff` of schema.prisma/migrations empty). auto_push=never — not pushed, version not bumped. DEVN-05 react-refresh on findCardById left untouched as instructed.
