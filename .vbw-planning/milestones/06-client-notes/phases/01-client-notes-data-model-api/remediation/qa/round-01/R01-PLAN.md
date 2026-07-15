---
phase: 1
round: 1
plan: R01
title: "Phase 01 QA Remediation R01 — Plan Amendments + Vitest Dist Exclusion"
type: remediation
autonomous: true
effort_override: balanced
skills_used: []
files_modified:
  - .vbw-planning/phases/01-client-notes-data-model-api/01-01-PLAN.md
  - backend/vitest.config.ts
forbidden_commands:
  - "prisma migrate reset"
  - "prisma migrate dev"
  - "prisma db push"
  - "rm dev.db"
fail_classifications:
  - {id: "DEV-01", type: "plan-amendment", rationale: "Dev appended the notes columns at the end of model Client scalar fields (not after color) and hand-authored migration.sql as 3 pure ADD COLUMN statements because Prisma 7 proposed a RedefineTables rebuild on the populated dev.db. QA independently verified zero RedefineTables, clean migrate status/no drift, PRAGMA column order matching schema.prisma, and all 6 pre-existing rows preserved. The engineering is correct and safer than the literal plan; reverting would force a table rebuild on populated data. The defect is that 01-01-PLAN.md still records the superseded approach, so the fix is to amend the plan, not the code.", source_plan: "01-01-PLAN.md"}
  - {id: "DEV-02", type: "plan-amendment", rationale: "Dev's schedule-isolation test (case 8) uses fixture-scoped row-identity toEqual snapshots plus clientId-scoped Assignment insert counts instead of the plan literal global row counts, because vitest runs suites in parallel against a shared dev.db and global counts would be flaky. QA read the test and confirmed it is a strictly stronger, parallel-safe proof of the no-write invariant, not a weaker substitute. Reverting to global counts would introduce a flaky assertion. The defect is that 01-01-PLAN.md still records the superseded method, so the fix is to amend the plan, not the test.", source_plan: "01-01-PLAN.md"}
known_issues_input:
  - '{"test":"Audit Service > logAuditEvent / queryAuditLogs / verifyAuditChain / exportAuditLogs (19 tests)","file":"backend/tests/services/audit.test.ts","error":"P1008 SocketTimeout on the AuditLog Serializable transaction (audit.ts:71, prisma.$transaction) under full-suite parallel load (SQLite single-writer contention via better-sqlite3 adapter). Passes in isolation. audit.ts is not in this plans files_modified."}'
  - '{"test":"Session Service > isTrustedDevice > returns true for valid trusted device","file":"backend/tests/services/session.test.ts","error":"Environmental (Redis/session store) failure in a file untouched by this plan."}'
  - '{"test":"Stale compiled duplicates under dist/ (boardAdminArchive, boardFiles, deleteAssignmentOrphan.stopped, pdfQueue, templateAdapter, templateMapping)","file":"backend/dist/**/*.test.js","error":"backend/dist/ is gitignored (.gitignore:12) stale tsc build output picked up by vitest, re-running pre-change compiled tests in parallel and roughly doubling dev.db write load, amplifying the SQLite single-writer contention above. Pre-existing environmental artifact, not part of this plans scope."}'
  - '{"test":"boardFiles routes > download/upload happy paths","file":"backend/src/routes/__tests__/boardFiles.test.ts","error":"Environmental (ClamAV/filesystem/SQLite-lock) failure in a file untouched by this plan; documented known flake."}'
  - '{"test":"client notes access (Phase 01) > (6) lets an ADMIN write notes -> 200; (7) writes exactly one client.notes.update audit entry","file":"backend/src/routes/__tests__/clientNotesAccess.test.ts","error":"Under FULL-SUITE load only (not in isolation, not paired with boardAdminArchive alone): PUT returns 500. Root-caused via stack trace to the identical P1008 SocketTimeout inside logAuditEvents prisma.$transaction (backend/src/services/audit.ts:47-71), not in schedule.ts or clientService.ts (both plan-owned files execute correctly - the update itself succeeds; the subsequent audit write times out under heavy concurrent SQLite load). Independently verified via stack trace inspection, not taken on Devs word. clientNotesAccess.test.ts is 8/8 green in isolation and when paired with boardAdminArchive.test.ts across 3 repeated runs; the underlying contention is in the untouched, shared audit.ts transaction, which fails identically and independently in tests/services/audit.test.ts under the same full-suite run."}'
  - '{"test":"pdfQueue > addPdfConversionJob > rejects invalid/empty file path (2 tests)","file":"backend/src/services/__tests__/pdfQueue.test.ts","error":"Environmental (Redis/BullMQ/Gotenberg-dependent) failure in a file untouched by this plan."}'
  - '{"test":"templateAdapter service > analyzeTemplate > calls Python service and LLM in correct order","file":"backend/src/services/__tests__/templateAdapter.test.ts","error":"TypeError: Cannot read properties of undefined (reading filter) at templateAdapter.ts:248 - mock/fixture drift in a file untouched by this plan."}'
  - '{"test":"templateMapping service > queryFewShotExamples (3 tests)","file":"backend/src/services/__tests__/templateMapping.test.ts","error":"Mock expectation mismatch: test expects orderBy {usageCount: desc} but service now uses orderBy [{confidence: desc},{usageCount: desc}]. Stale test vs. code drift in a file untouched by this plan."}'
known_issue_resolutions:
  - '{"test":"Audit Service > logAuditEvent / queryAuditLogs / verifyAuditChain / exportAuditLogs (19 tests)","file":"backend/tests/services/audit.test.ts","error":"P1008 SocketTimeout on the AuditLog Serializable transaction (audit.ts:71, prisma.$transaction) under full-suite parallel load (SQLite single-writer contention via better-sqlite3 adapter). Passes in isolation. audit.ts is not in this plans files_modified.","disposition":"accepted-process-exception","rationale":"SQLite single-writer contention in the untouched, shared audit.ts transaction; passes deterministically in isolation. Not fixable within this phase boundary (audit.ts is out of scope). Already an accepted process-exception in phases 09 and 24 (see STATE Todos ref 29396258, e7a9bb3e). Task 2 (dist exclusion) halves parallel dev.db write load and is expected to reduce recurrence, but cannot eliminate the underlying single-writer limit."}'
  - '{"test":"Session Service > isTrustedDevice > returns true for valid trusted device","file":"backend/tests/services/session.test.ts","error":"Environmental (Redis/session store) failure in a file untouched by this plan.","disposition":"accepted-process-exception","rationale":"Environmental Redis/session-store dependency in an untouched service; not exercisable in this CI environment and outside this phase boundary. Already an accepted process-exception in phase 09 (see STATE Todos ref c95df50d)."}'
  - '{"test":"Stale compiled duplicates under dist/ (boardAdminArchive, boardFiles, deleteAssignmentOrphan.stopped, pdfQueue, templateAdapter, templateMapping)","file":"backend/dist/**/*.test.js","error":"backend/dist/ is gitignored (.gitignore:12) stale tsc build output picked up by vitest, re-running pre-change compiled tests in parallel and roughly doubling dev.db write load, amplifying the SQLite single-writer contention above. Pre-existing environmental artifact, not part of this plans scope.","disposition":"resolved","rationale":"Task 2 adds an explicit dist exclusion to backend/vitest.config.ts (preserving the vitest default excludes), so vitest no longer discovers the 19 stale compiled backend/dist/**/*.test.js duplicates. This is a small, contained, in-scope config change with no product-code impact; it removes the duplicate test discovery entirely and reduces the parallel dev.db write pressure that amplifies the other contention failures."}'
  - '{"test":"boardFiles routes > download/upload happy paths","file":"backend/src/routes/__tests__/boardFiles.test.ts","error":"Environmental (ClamAV/filesystem/SQLite-lock) failure in a file untouched by this plan; documented known flake.","disposition":"accepted-process-exception","rationale":"Environmental ClamAV/filesystem/SQLite-lock dependency in an untouched file; documented flake. Outside this phase boundary. Already an accepted process-exception in phases 03 and 09 (see STATE Todos ref 51a72302, 40766167)."}'
  - '{"test":"client notes access (Phase 01) > (6) lets an ADMIN write notes -> 200; (7) writes exactly one client.notes.update audit entry","file":"backend/src/routes/__tests__/clientNotesAccess.test.ts","error":"Under FULL-SUITE load only (not in isolation, not paired with boardAdminArchive alone): PUT returns 500. Root-caused via stack trace to the identical P1008 SocketTimeout inside logAuditEvents prisma.$transaction (backend/src/services/audit.ts:47-71), not in schedule.ts or clientService.ts (both plan-owned files execute correctly - the update itself succeeds; the subsequent audit write times out under heavy concurrent SQLite load). Independently verified via stack trace inspection, not taken on Devs word. clientNotesAccess.test.ts is 8/8 green in isolation and when paired with boardAdminArchive.test.ts across 3 repeated runs; the underlying contention is in the untouched, shared audit.ts transaction, which fails identically and independently in tests/services/audit.test.ts under the same full-suite run.","disposition":"accepted-process-exception","rationale":"The plan-owned code (schedule.ts, clientService.ts) executes correctly; the 500 originates in the untouched shared audit.ts transaction (same P1008 as the audit.test.ts issue) only under full-suite parallel load. The suite is 8/8 green in isolation and paired with boardAdminArchive across 3 runs. Same-family SQLite single-writer contention already accepted in phases 09 and 24. Task 2 (dist exclusion) is expected to reduce recurrence by cutting parallel write load, but the residual risk is the shared audit transaction, which is out of this phase boundary."}'
  - '{"test":"pdfQueue > addPdfConversionJob > rejects invalid/empty file path (2 tests)","file":"backend/src/services/__tests__/pdfQueue.test.ts","error":"Environmental (Redis/BullMQ/Gotenberg-dependent) failure in a file untouched by this plan.","disposition":"accepted-process-exception","rationale":"Environmental Redis/BullMQ/Gotenberg dependency in an untouched service; not exercisable in this CI environment and outside this phase boundary. Already an accepted process-exception in phases 01, 03, and 09 (see STATE Todos ref 00587024, 7df0c371, 6139e70a)."}'
  - '{"test":"templateAdapter service > analyzeTemplate > calls Python service and LLM in correct order","file":"backend/src/services/__tests__/templateAdapter.test.ts","error":"TypeError: Cannot read properties of undefined (reading filter) at templateAdapter.ts:248 - mock/fixture drift in a file untouched by this plan.","disposition":"accepted-process-exception","rationale":"Stale mock/fixture drift in an untouched template-AI service unrelated to client notes; fixing it would require editing tests outside this phase boundary. Already an accepted process-exception in phases 01, 03, and 09 (see STATE Todos ref 76aeafeb, c88126f1, 32c56445)."}'
  - '{"test":"templateMapping service > queryFewShotExamples (3 tests)","file":"backend/src/services/__tests__/templateMapping.test.ts","error":"Mock expectation mismatch: test expects orderBy {usageCount: desc} but service now uses orderBy [{confidence: desc},{usageCount: desc}]. Stale test vs. code drift in a file untouched by this plan.","disposition":"accepted-process-exception","rationale":"Stale mock expectation vs. code drift in an untouched service unrelated to client notes; fixing it would require editing tests outside this phase boundary. Already an accepted process-exception in phases 01, 03, and 09 (see STATE Todos ref 36c58190, 3ed05977, b1f2de98)."}'
must_haves:
  truths:
    - "01-01-PLAN.md is amended to record the as-built approach for DEV-01 (notes columns appended at the end of model Client scalar fields; hand-authored purely-additive migration.sql of 3 ADD COLUMN statements, zero RedefineTables, because Prisma 7 proposed a table rebuild) and marks DEV-01 resolved-by-amendment."
    - "01-01-PLAN.md is amended to record the as-built schedule-isolation assertion for DEV-02 (fixture-scoped row-identity toEqual snapshots plus clientId-scoped Assignment insert counts, chosen for parallel-worker safety) and marks DEV-02 resolved-by-amendment."
    - "backend/vitest.config.ts excludes dist from test discovery while preserving the vitest default excludes; vitest no longer discovers any backend/dist/**/*.test.js file."
    - "No product code under backend/src, backend/prisma, or frontend is reverted or weakened: the migration, schema column order, and clientNotesAccess.test.ts assertions are unchanged, and clientNotesAccess.test.ts stays 8/8 green in isolation."
  artifacts:
    - path: ".vbw-planning/phases/01-client-notes-data-model-api/01-01-PLAN.md"
      provides: "as-built amendment recording the real DEV-01 migration/placement and DEV-02 isolation approach, each marked resolved-by-amendment"
      contains: "As-built amendment (QA R01)"
    - path: "backend/vitest.config.ts"
      provides: "explicit dist exclusion for vitest test discovery, preserving default excludes"
      contains: "configDefaults.exclude"
  key_links:
    - from: ".vbw-planning/phases/01-client-notes-data-model-api/remediation/qa/round-01/R01-PLAN.md"
      to: ".vbw-planning/phases/01-client-notes-data-model-api/01-01-PLAN.md"
      via: "fail_classifications DEV-01/DEV-02 source_plan amendment edits the original plan"
    - from: "backend/vitest.config.ts"
      to: "backend/dist/**/*.test.js"
      via: "test.exclude spread of configDefaults.exclude plus dist glob removes stale compiled duplicates from discovery"
---
<objective>
Close the two Phase 01 QA FAIL checks and clear the eight carried known issues for the deep-tier verification.

Both FAILs (DEV-01, DEV-02) are declared deviations that QA independently verified as technically sound and SAFER than the plan's literal instruction. They are classified `plan-amendment`: the code is correct and must NOT be reverted; the defect is that `01-01-PLAN.md` still records a superseded approach. This round edits `01-01-PLAN.md` to record the real, as-built approach and rationale, marking each deviation resolved-by-amendment (a SUMMARY-only touch is not sufficient — the gate checks the original plan was amended).

Of the eight known issues, seven are failures in files this phase did not modify (SQLite single-writer contention in the shared audit transaction, plus environmental Redis/ClamAV/template-AI drift) and are accepted as process-exceptions with cited prior-phase history. The eighth — vitest discovering 19 stale compiled `backend/dist/**/*.test.js` duplicates — is cheaply and safely fixable inside this phase by excluding `dist` from vitest test discovery, which also reduces the parallel dev.db write load that amplifies the contention failures; it is marked resolved.
</objective>
<context>
@.vbw-planning/phases/01-client-notes-data-model-api/01-VERIFICATION.md
@.vbw-planning/phases/01-client-notes-data-model-api/01-01-PLAN.md
@.vbw-planning/phases/01-client-notes-data-model-api/remediation/qa/round-01/R01-KNOWN-ISSUES.json
Anchors (validated current this round):
- backend/vitest.config.ts sets no test.include/test.exclude; vitest currently discovers 19 stale backend/dist/**/*.test.js files (confirmed via `npx vitest list`).
- .vbw-planning/STATE.md Todos already carry the audit/session/pdfQueue/boardFiles/template* contention and drift failures as accepted process-exceptions from phases 01/03/09/24 — legitimate grounds to accept again.
- 01-01-PLAN.md Task 1 action (~line 83) states "after color" placement; Task 4 action (~line 163) states "global row counts" — these are the two lines superseded by the as-built approach.
</context>
<tasks>
<!-- Sequential: Task 2 depends on nothing from Task 1, but keep order for atomic-commit clarity. -->
<task type="auto">
  <name>Amend 01-01-PLAN.md to record the as-built DEV-01 and DEV-02 approach</name>
  <files>
    .vbw-planning/phases/01-client-notes-data-model-api/01-01-PLAN.md
  </files>
  <action>
Edit `01-01-PLAN.md` (do NOT touch any backend/frontend source). Record the real, as-built approach for both declared deviations. Do NOT weaken or delete the existing must_haves truths — they already match the as-built code. Specifically:

1. In Task 1's `<action>` block (the "placed after the `color` field" instruction, ~line 83) and its migration-generation note, append an amendment note:
   `As-built amendment (QA R01): the three notes columns were appended at the END of model Client's scalar fields (after updatedAt), not after color, and migration.sql was hand-authored as three pure ALTER TABLE "Client" ADD COLUMN statements rather than tool-generated, because Prisma 7's engine proposed a RedefineTables table rebuild for the populated dev.db. QA independently verified: zero RedefineTables in migration.sql, prisma migrate status clean with no drift, PRAGMA table_info(Client) order matching schema.prisma exactly, and all 6 pre-existing Client rows preserved with notes='' and null attribution. DEV-01 resolved-by-amendment — do NOT revert (reverting would force a table rebuild on populated data).`

2. In Task 4's `<action>` block (the case-8 "row counts before the PUT and assert they are unchanged" instruction, ~line 163), append an amendment note:
   `As-built amendment (QA R01): case 8 asserts fixture-scoped row-identity (toEqual before/after on the exact seeded TeamMember/Assignment/Absence/Holiday rows) PLUS insert-count checks scoped by markers tied to the fixture (Assignment count filtered by clientId), NOT literal global row counts, because vitest runs suites in parallel against a shared dev.db and global counts would be flaky. QA verified this is a strictly stronger, parallel-safe proof of the no-write invariant. DEV-02 resolved-by-amendment — do NOT revert to global counts.`

Place each note inline in the corresponding `<action>` block so the plan's literal instruction and the as-built reality are both visible. Keep edits confined to these two blocks.
  </action>
  <verify>
- `grep -n "As-built amendment (QA R01)" .vbw-planning/phases/01-client-notes-data-model-api/01-01-PLAN.md` returns exactly two matches (Task 1 and Task 4 blocks).
- `grep -n "DEV-01 resolved-by-amendment" .vbw-planning/phases/01-client-notes-data-model-api/01-01-PLAN.md` and `grep -n "DEV-02 resolved-by-amendment" ...` each return one match.
- `git diff --name-only` shows only `.vbw-planning/phases/01-client-notes-data-model-api/01-01-PLAN.md` changed — no backend/ or frontend/ file touched.
  </verify>
  <done>
01-01-PLAN.md records both as-built approaches with rationale and resolved-by-amendment markers. One commit: `docs(plan): amend 01-01 to record as-built additive migration and scoped isolation (QA R01)`.
  </done>
</task>
<task type="auto">
  <name>Exclude stale dist build output from vitest test discovery</name>
  <files>
    backend/vitest.config.ts
  </files>
  <action>
Fix the stale-dist known issue at its root: vitest currently discovers the 19 compiled `backend/dist/**/*.test.js` duplicates (gitignored tsc output), re-running pre-change tests in parallel and roughly doubling dev.db write load.

In `backend/vitest.config.ts`:
1. Import `configDefaults` alongside `defineConfig`: `import { defineConfig, configDefaults } from 'vitest/config';`
2. Add a `test.exclude` that PRESERVES the vitest defaults (which include node_modules) and appends dist:
   `exclude: [...configDefaults.exclude, '**/dist/**'],`
   Place it inside the `test: { ... }` block (e.g. next to `globals`/`environment`).

Do NOT alter the existing `env`, `coverage`, or `resolve` sections. Do NOT run any prisma/db command. Do NOT delete or modify any test file. This is a discovery-config change only.
  </action>
  <verify>
- `grep -n "configDefaults" backend/vitest.config.ts` shows both the import and the spread in test.exclude.
- `cd backend && npx vitest list 2>/dev/null | grep -c 'dist/'` returns 0 (was ~163 before) — no dist test is discovered.
- `cd backend && npx vitest run src/routes/__tests__/clientNotesAccess.test.ts` still passes 8/8 (the exclusion does not affect real src tests).
- `git diff --name-only` shows only `backend/vitest.config.ts` changed.
  </verify>
  <done>
vitest no longer discovers backend/dist/**/*.test.js; default excludes preserved; clientNotesAccess suite still 8/8 green. One commit: `test(backend): exclude stale dist build output from vitest discovery`.
  </done>
</task>
</tasks>
<verification>
1. `01-01-PLAN.md` contains exactly two "As-built amendment (QA R01)" notes and both `DEV-01 resolved-by-amendment` / `DEV-02 resolved-by-amendment` markers; no backend/frontend source reverted.
2. `backend/vitest.config.ts` excludes dist via `[...configDefaults.exclude, '**/dist/**']`; `npx vitest list` shows 0 dist entries.
3. `npx vitest run src/routes/__tests__/clientNotesAccess.test.ts` is 8/8 green; migration.sql, schema.prisma column order, and the case-8 assertions are untouched.
4. `git diff --name-only` across the two commits shows only `.vbw-planning/.../01-01-PLAN.md` and `backend/vitest.config.ts`.
5. No file under `frontend/` is modified; `dev.db` is not reset or destroyed (no prisma migrate/db command run).
6. All eight carried known issues are covered by matching `known_issues_input` / `known_issue_resolutions` entries: one `resolved` (dist), seven `accepted-process-exception` with cited prior-phase history.
</verification>
<success_criteria>
- DEV-01 and DEV-02 are resolved by amending `01-01-PLAN.md` to the as-built approach; the technically-sound code is preserved (no migration revert, no column re-placement, no test weakening).
- The stale `backend/dist/**/*.test.js` duplicates are no longer discovered by vitest, resolving that known issue and reducing parallel dev.db write pressure.
- The remaining seven known issues are accepted as process-exceptions with credible, phase-boundary rationales backed by prior-phase acceptance history.
- Exactly two atomic commits, conventional-commit format, touching only the two declared files; no frontend changes; no data loss in dev.db.
</success_criteria>
<known_issue_workflow>
- `known_issues_input` and `known_issue_resolutions` each carry all eight carried issues; none dropped. Single quotes/apostrophes were normalized out of every test/file/error string to keep the YAML single-quoted scalars gate-safe.
- One issue (stale dist duplicates) is `resolved` by Task 2. The other seven are `accepted-process-exception`: real but non-blocking, in files this phase did not modify, not fixable within the phase boundary, and each already accepted in phases 01/03/09/24.
- No issue is marked `unresolved`; nothing is carried into a further round.
</known_issue_workflow>
<output>
R01-SUMMARY.md
</output>
