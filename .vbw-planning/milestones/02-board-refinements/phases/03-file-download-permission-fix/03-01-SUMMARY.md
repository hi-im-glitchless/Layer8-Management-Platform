---
phase: 3
plan: "01"
title: File Download Permission Fix
status: complete
completed: 2026-06-03
tasks_completed: 2
tasks_total: 2
commit_hashes:
  - badad1db0b1d485aacfb83506f0cbe1c9479144c
  - 9935c973f9420e2eea0b111078dce1fc9884ba0a
deviations: []
pre_existing_issues: []
ac_results:
  - criterion: "A new exported guard requireCardExists(req,res,next) exists in boardAuth.ts: resolves cardId from req.params.cardId ?? req.params.id, 401 if no session.userId, 400 if no cardId, no-include prisma.boardCard.findUnique, 404 if not found, attaches req.boardCard = { id, projectId, stage }, then next() for ANY authenticated user (no role branch)."
    verdict: pass
    evidence: "backend/src/middleware/boardAuth.ts requireCardExists (commit badad1d); no include, no 403/role/assignment branch"
  - criterion: "requireCardExists reads ONLY BoardCard — zero Assignment/TeamMember/Absence/Holiday reads or writes — and carries the schedule-isolation JSDoc annotation matching requireCardAccess."
    verdict: pass
    evidence: "boardAuth.ts: findUnique({ where:{ id } }) only; NON-NEGOTIABLE JSDoc + 'reads ONLY BoardCard' tightening note (commit badad1d)"
  - criterion: "In boardFiles.ts the LIST route (GET '/') and DOWNLOAD route (GET '/:fileId/download') use requireCardExists; line 8 imports both requireCardAccess and requireCardExists."
    verdict: pass
    evidence: "boardFiles.ts line 8 named import both; GET '/' and GET '/:fileId/download' chains use requireCardExists (commit badad1d)"
  - criterion: "UPLOAD (POST '/'), DELETE (DELETE '/:fileId'), and every other board sub-resource remain on requireCardAccess; delete remains PM/ADMIN-only via its explicit role check."
    verdict: pass
    evidence: "boardFiles.ts upload + delete chains unchanged on requireCardAccess; delete handler's ADMIN/PM check untouched (commit badad1d)"
  - criterion: "All download-route safeguards preserved verbatim: cross-card 404, quarantine 410, missing-on-disk 404, board.file.download audit with userId; list non-ADMIN quarantined filter unchanged."
    verdict: pass
    evidence: "boardFiles.ts download handler body unchanged; tests (e) 404, (f) 410, (a) list-filter length 1 (commit 9935c97)"
  - criterion: "SCHEDULE-ISOLATION INVARIANT JSDoc block in boardFiles.ts remains intact and accurate; no file route reads/writes schedule tables."
    verdict: pass
    evidence: "boardFiles.ts router-level invariant JSDoc unchanged (commit badad1d)"
  - criterion: "New test boardFiles.test.ts mounts the real filesRouter at /cards/:cardId/files (mergeParams:true) against the dev DB, injects sessions, and proves the policy (200 list/download non-assigned; 403 upload/delete; 404 cross-card; 410 quarantine; assigned 200/200)."
    verdict: pass
    evidence: "boardFiles.test.ts 8 tests (a)-(h) pass in isolation (commit 9935c97)"
  - criterion: "The test seeds/tears down with a copied withDbRetry and cleans up per-card upload dirs with fs.rmSync in a finally; does not mutate Assignment/TeamMember beyond the minimal read-fixture."
    verdict: pass
    evidence: "boardFiles.test.ts local withDbRetry; afterEach teardown + fs.rmSync; assertion (h) confirms TeamMember/Assignment rows unmutated (commit 9935c97)"
  - criterion: "No Prisma migration is created or run."
    verdict: pass
    evidence: "git status: no new file under backend/prisma/migrations/; no forbidden prisma command run"
---

Broadened board-file LIST + DOWNLOAD to any authenticated member via a new no-include `requireCardExists` guard, kept all mutations on `requireCardAccess`, and added a route-level regression test — schedule isolation preserved, no migration.

## What Was Built

- `requireCardExists` guard in `boardAuth.ts`: 401 if no session.userId, 400 if no cardId, no-include `prisma.boardCard.findUnique` (404 if missing), attaches `req.boardCard = { id, projectId, stage }`, then `next()` for any authenticated user — no role/assignment branch. Reads ONLY BoardCard (zero Assignment/TeamMember reads — a tightening of the schedule-isolation invariant), carrying a matching NON-NEGOTIABLE JSDoc annotation. `requireCardAccess` left unchanged.
- `boardFiles.ts`: line-8 import now names both guards; the file LIST (`GET '/'`) and DOWNLOAD (`GET '/:fileId/download'`) routes swapped to `requireCardExists`. Upload, delete, and all other sub-resources stay on `requireCardAccess`; delete stays PM/ADMIN-only. All download safeguards (cross-card 404, quarantine 410, missing-on-disk 404, `board.file.download` audit with userId), the ADMIN-gated list quarantined filter, and the router-level SCHEDULE-ISOLATION INVARIANT JSDoc are intact.
- `boardFiles.test.ts`: route-level regression mounting the real `filesRouter` at `/cards/:cardId/files` (mergeParams:true) against the dev DB with a header-driven session injector and a copied `withDbRetry` backoff. 8 tests (a)-(h) prove: non-assigned NORMAL list 200 + download 200, upload 403 + delete 403 (row survives), cross-card 404, quarantine 410, assigned-NORMAL happy path 200/200, and that the seeded Assignment/TeamMember rows are unmutated. Seeded rows and per-card upload dirs cleaned in `afterEach` (`fs.rmSync` in a try/finally).

Verification: backend `npm run build` (tsc) exit 0 across all three files; `npx vitest run src/routes/__tests__/boardFiles.test.ts` → 8/8 passed in isolation (absorbs the documented concurrent-SQLite known-issue via withDbRetry); no new file under `backend/prisma/migrations/`; no forbidden prisma command run.

## Files Modified

- `backend/src/middleware/boardAuth.ts` -- modified: added `requireCardExists` read guard (no-include lookup, any authenticated user, schedule-isolation annotation) alongside the unchanged `requireCardAccess`.
- `backend/src/routes/boardFiles.ts` -- modified: import both guards; swap LIST + DOWNLOAD routes to `requireCardExists`; upload/delete and safeguards/isolation JSDoc unchanged.
- `backend/src/routes/__tests__/boardFiles.test.ts` -- created: route-level regression proving the broadened read policy, preserved mutation gating, cross-card/quarantine safeguards, and schedule isolation.

## Deviations

None.
