---
phase: 1
plan_count: 2
status: issues_found
started: 2026-07-10
completed: 2026-07-10
total_tests: 9
passed: 3
skipped: 0
issues: 6
---

Human acceptance testing for Phase 01 — Client Notes data model, read/write API, attribution, and audit trail.

## Tests

### D01: Review summary deviation — notes column placement + hand-authored migration

- **Source:** Summary deviation review
- **Deviation Signature:** 2b7c52ee2aa194624ecbba4ddfec0ced9d3082fb80d3cc5a54e1c60f4e13bd3b
- **Source Plan:** 01
- **Source Summary:** 01-01-SUMMARY.md
- **Deviation:** Task 1: placed the three notes columns at the END of the Client model's scalar fields (after updatedAt) instead of 'after color', and hand-authored the migration.sql as three pure ALTER TABLE ... ADD COLUMN statements. Prisma 7's migration engine generated a RedefineTables/table-rebuild block for a mid-table (and even end-of-table) NOT-NULL-with-default add; that block violates must_have #1 (purely additive, ADD COLUMN only, no table redefinition). Overriding column placement to satisfy the stronger must_have. SQLite fully supports `ADD COLUMN ... NOT NULL DEFAULT ''`. Applied via `prisma migrate deploy` (never resets); `prisma migrate status` reports clean, no drift. Standard --create-only-then-edit workflow; matches the 20260506151736 BoardCard precedent.
- **Plan:** 01 -- Client Notes — Data Model + API
- **Scenario:** Review a documented implementation deviation from SUMMARY.md
- **Expected:** Human confirms whether this documented deviation is acceptable for this phase.
- **Result:** issue
- **Disposition:** rejected-by-user
- **Issue:**
  - Description: User rejected this documented deviation and requires it addressed before the phase completes ("Fix all the deviations before ending the phase"). Deviation: the three notes columns were placed at the end of the Client model's scalar fields (not "after color") and migration.sql was hand-authored as three ADD COLUMN statements instead of the plan's tool-generated migration. Reconcile the implementation with the plan contract — either bring the code to the plan's literal specification, or amend Plan 01 to formally adopt the additive hand-authored migration and end-of-model column placement with rationale — so no unreviewed deviation remains at phase end.
  - Severity: major

### D02: Review summary deviation — fixture-scoped schedule-isolation assertion

- **Source:** Summary deviation review
- **Deviation Signature:** 02b5e3a53e93f47a3cb422b6c3dd00bc86f8d45bef573fcd0f10f3799f893eab
- **Source Plan:** 01
- **Source Summary:** 01-01-SUMMARY.md
- **Deviation:** Task 4: the schedule-isolation check (case 8) asserts fixture-scoped row snapshots + marker-scoped counts instead of literal GLOBAL Assignment/TeamMember/Absence/Holiday counts. Vitest runs suites in parallel against the shared dev.db and other suites (e.g. boardPatchChecklistAccess) seed/tear down Assignment+TeamMember rows concurrently, so a global count snapshot would flake spuriously. The scoped version proves the same intent (no incidental schedule write) but is parallel-worker-safe.
- **Plan:** 01 -- Client Notes — Data Model + API
- **Scenario:** Review a documented implementation deviation from SUMMARY.md
- **Expected:** Human confirms whether this documented deviation is acceptable for this phase.
- **Result:** issue
- **Disposition:** rejected-by-user
- **Issue:**
  - Description: User rejected this documented deviation and requires it addressed before the phase completes ("Fix all the deviations before ending the phase"). Deviation: the schedule-isolation test (case 8) asserts fixture-scoped row snapshots + marker-scoped counts instead of the plan's literal global Assignment/TeamMember/Absence/Holiday counts. Reconcile the test with the plan contract — either bring it to the plan's literal global-count assertion, or amend Plan 01 to formally adopt the parallel-worker-safe fixture-scoped assertion with rationale — so no unreviewed deviation remains.
  - Severity: major

### D03: Review summary deviation — frontmatter preamble fragment

- **Source:** Summary deviation review
- **Deviation Signature:** 9c7e59b348510c163df3087aac86e9561e487f5e2f294103f23d3190058b67fc
- **Source Plan:** 01
- **Source Summary:** 01-01-SUMMARY.md
- **Deviation:** Two deviations, both recorded in frontmatter:
- **Plan:** 01 -- Client Notes — Data Model + API
- **Scenario:** Review a documented implementation deviation from SUMMARY.md
- **Expected:** Human confirms whether this documented deviation is acceptable for this phase.
- **Result:** issue
- **Disposition:** rejected-by-user
- **Issue:**
  - Description: User rejected all documented deviations ("Fix all the deviations before ending the phase"). This entry is the SUMMARY.md frontmatter preamble fragment ("Two deviations, both recorded in frontmatter:") introducing the two underlying deviations captured in D01/D04 (Task 1 migration/column placement) and D02/D05 (Task 4 isolation assertion). Not a distinct deviation of its own — resolve by addressing those two underlying deviations. Remediation may classify this as a process-exception once the real deviations are handled.
  - Severity: major

### D04: Review summary deviation — body restatement of D01

- **Source:** Summary deviation review
- **Deviation Signature:** 2158ab46a0645bea8e015c1182b535bd06e550d5b0844dfadabd4e89547972f2
- **Source Plan:** 01
- **Source Summary:** 01-01-SUMMARY.md
- **Deviation:** 1. **Task 1 column placement + hand-authored migration.** Notes columns were placed at the end of the Client scalar fields (not "after color") and the migration was hand-written as three `ADD COLUMN` statements. Prisma 7 insisted on a `RedefineTables` table-rebuild for the `NOT NULL DEFAULT ''` add even with columns at the end; that rebuild would violate must_have #1 (purely additive, no table redefinition) and is riskier on the populated DB. The additive SQL is fully supported by SQLite, matches the BoardCard precedent (20260506151736), was applied with `prisma migrate deploy` (never resets), and `prisma migrate status` confirms a clean, drift-free DB.
- **Plan:** 01 -- Client Notes — Data Model + API
- **Scenario:** Review a documented implementation deviation from SUMMARY.md
- **Expected:** Human confirms whether this documented deviation is acceptable for this phase.
- **Result:** issue
- **Disposition:** rejected-by-user
- **Issue:**
  - Description: User rejected all documented deviations ("Fix all the deviations before ending the phase"). This is the SUMMARY.md body restatement of the Task 1 column-placement + hand-authored-migration deviation already captured in D01. Address together with D01 (bring code to the plan contract, or amend Plan 01 to formally adopt the additive migration + end-of-model placement).
  - Severity: major

### D05: Review summary deviation — body restatement of D02

- **Source:** Summary deviation review
- **Deviation Signature:** d29870e93978c16e121c1c37285b2e0f85c5e23fdae648e69799eb15008a8b1e
- **Source Plan:** 01
- **Source Summary:** 01-01-SUMMARY.md
- **Deviation:** 2. **Task 4 isolation assertion style.** Case 8 uses fixture-scoped row snapshots + marker-scoped counts instead of literal global schedule-table counts, because parallel vitest workers mutate those tables concurrently and a global count would flake. Same intent, parallel-worker-safe.
- **Plan:** 01 -- Client Notes — Data Model + API
- **Scenario:** Review a documented implementation deviation from SUMMARY.md
- **Expected:** Human confirms whether this documented deviation is acceptable for this phase.
- **Result:** issue
- **Disposition:** rejected-by-user
- **Issue:**
  - Description: User rejected all documented deviations ("Fix all the deviations before ending the phase"). This is the SUMMARY.md body restatement of the Task 4 fixture-scoped isolation-assertion deviation already captured in D02. Address together with D02 (bring the test to the plan's literal global-count assertion, or amend Plan 01 to formally adopt the parallel-worker-safe scoped assertion).
  - Severity: major

### D06: Review summary deviation — pre-existing SQLite contention note

- **Source:** Summary deviation review
- **Deviation Signature:** 32d940223ec243bb672ffe076c8e0b9ce72f5c824a9ad68d67df34bed88f0d8f
- **Source Plan:** 01
- **Source Summary:** 01-01-SUMMARY.md
- **Deviation:** Under a full `vitest run` (425 tests, doubled by stale gitignored `dist/**/*.test.js` compiled duplicates), 41 tests fail with SQLite single-writer `P1008 SocketTimeout` contention — including 2 of my own cases (6 and 8) whose audit-transaction write times out under load. My suite is deterministically 8/8 green in isolation and when run with `boardAdminArchive` (which shares the `logAuditEvent` path), confirming these are the repo's known SQLite-concurrency flakes, not a defect introduced here. See `pre_existing_issues` for the full breakdown of unrelated pre-existing failures in untouched files.
- **Plan:** 01 -- Client Notes — Data Model + API
- **Scenario:** Review a documented implementation deviation from SUMMARY.md
- **Expected:** Human confirms whether this documented deviation is acceptable for this phase.
- **Result:** issue
- **Disposition:** rejected-by-user
- **Issue:**
  - Description: User rejected all documented deviations ("Fix all the deviations before ending the phase"). This entry documents pre-existing SQLite single-writer P1008 SocketTimeout contention affecting ~41 tests under a full parallel `vitest run` (including the new suite's cases 6 and 8), attributed to stale gitignored `dist/**/*.test.js` duplicates plus shared dev.db concurrency — the new suite is 8/8 green in isolation, so this is a pre-existing repo-wide flake, not a defect this phase introduced. The R01 remediation already excluded `dist/**` from vitest discovery. Confirm the dist-exclusion fix resolves the doubled-run contention; remediation may classify residual shared-dev.db flakiness as a process-exception if it cannot be deterministically removed within this phase's scope.
  - Severity: major

### P01-T01: Existing client data survived the migration

- **Plan:** 01 -- Client Notes — Data Model + API
- **Scenario:** The migration added three columns to the Client table on the live populated database. Log in and open the Schedule page. Look at the client list / client filter and the existing projects and assignments.
- **Expected:** All six pre-existing clients are still present (Acme Corp, Globex, Initech, Umbrella Health, Wayne Industries, clitest), each with its original colour, and existing projects and assignments are unchanged. Nothing appears lost, duplicated, or reset.
- **Result:** pass

### P01-T02: A client-notes edit is recorded in the tamper-evident audit log

- **Plan:** 01 -- Client Notes — Data Model + API
- **Scenario:** As a PM or Admin, go to Tools > Client Notes, open any client, type something into the notes, and save. Then log in as an Admin and open the Audit Log page in the sidebar.
- **Expected:** The audit log shows a new `client.notes.update` entry identifying who made the change, which client, and when. This is the app's first audited notes-write, so the entry should look consistent with other audited actions in the log.
- **Result:** pass

### PR01-T01: No regression after the QA remediation round

- **Plan:** R01 -- Phase 01 QA Remediation R01 — Plan Amendments + Vitest Dist Exclusion
- **Scenario:** The remediation round only amended planning documents and changed which files the backend test runner discovers — no application code was touched. Use the app normally for a moment: load the Schedule page and open a project.
- **Expected:** The application behaves exactly as it did before. Nothing about the running app changed.
- **Result:** pass

## Summary

- Passed: 0
- Skipped: 0
- Issues: 0
- Total: 9
