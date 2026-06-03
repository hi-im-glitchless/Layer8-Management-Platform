---
phase: 24
round: 1
plan: R01
title: Fix schedule-isolation test concurrency defect and restore the deleted phase24 isolation test
type: remediation
autonomous: true
effort_override: thorough
skills_used: []
files_modified:
  - backend/src/services/__tests__/scheduleIsolation.phase23.test.ts
  - backend/src/services/__tests__/scheduleIsolation.phase24.test.ts
forbidden_commands: []
fail_classifications:
  - {id: "ART-04", type: "code-fix", rationale: "Declared 24-05 deliverable scheduleIsolation.phase24.test.ts (commits 4acbf39 + f40f79a) was deleted by post-phase commit 0d9ed2b without a Phase 24 plan amendment. Per user directive the file is recreated as an isolation-safe test aligned to the current Project-entity model, restoring the missing artifact."}
  - {id: "DEV-02", type: "code-fix", rationale: "DEVN-05 was accepted as a process-exception only because the phase23 concurrent failure was deemed pre-existing test-design; the triggering file was then undeclared-deleted, leaving a plan-vs-code mismatch. Per user directive we fix the root global-findMany defect in snapshotScheduleTables AND recreate the triggering file so the exception condition is genuinely resolved rather than masked by deletion."}
known_issues_input:
  - '{"test":"scheduleIsolation.phase23 (concurrent run)","file":"backend/src/services/__tests__/scheduleIsolation.phase23.test.ts","error":"4/6 tests fail when run concurrently with scheduleIsolation.phase24.test.ts due to global-snapshot sensitivity in Phase 23s snapshotScheduleTables — Phase 23 still passes 6/6 when run in isolation. Note: scheduleIsolation.phase24.test.ts was subsequently deleted by post-phase commit 0d9ed2b, making the concurrent-run scenario moot in the current codebase state, but the underlying Phase 23 test-design issue (unfiltered global findMany in snapshotScheduleTables) remains."}'
  - '{"test":"scheduleIsolation.phase23 (concurrent run)","file":"backend/src/services/__tests__/scheduleIsolation.phase23.test.ts","error":"4/6 tests fail when run concurrently with scheduleIsolation.phase24.test.ts due to global-snapshot sensitivity in Phase 23s snapshotScheduleTables — Phase 23 still passes 6/6 when run in isolation"}'
known_issue_resolutions:
  - '{"test":"scheduleIsolation.phase23 (concurrent run)","file":"backend/src/services/__tests__/scheduleIsolation.phase23.test.ts","error":"4/6 tests fail when run concurrently with scheduleIsolation.phase24.test.ts due to global-snapshot sensitivity in Phase 23s snapshotScheduleTables — Phase 23 still passes 6/6 when run in isolation. Note: scheduleIsolation.phase24.test.ts was subsequently deleted by post-phase commit 0d9ed2b, making the concurrent-run scenario moot in the current codebase state, but the underlying Phase 23 test-design issue (unfiltered global findMany in snapshotScheduleTables) remains.","disposition":"resolved","rationale":"Task 1 replaces the unfiltered global findMany in snapshotScheduleTables with reads scoped to the test dataset (filter by the seeded teamMemberId / holidayId / absenceId), so a concurrent suite seeding its own rows can no longer contaminate the snapshot. Phase 23 then passes 6/6 even when run concurrently with the recreated phase24 suite (Task 3 confirms via a single concurrent vitest run)."}'
  - '{"test":"scheduleIsolation.phase23 (concurrent run)","file":"backend/src/services/__tests__/scheduleIsolation.phase23.test.ts","error":"4/6 tests fail when run concurrently with scheduleIsolation.phase24.test.ts due to global-snapshot sensitivity in Phase 23s snapshotScheduleTables — Phase 23 still passes 6/6 when run in isolation","disposition":"resolved","rationale":"Same root cause and same fix as the registry-sourced entry: scoping snapshotScheduleTables to the test dataset removes the global-snapshot sensitivity. With the snapshot scoped per-test, the recreated phase24 isolation suite (Task 2) runs concurrently with phase23 with zero cross-contamination, confirmed by the concurrent vitest run in Task 3."}'
must_haves:
  truths:
    - "snapshotScheduleTables reads are scoped to the current test's seeded dataset, not the whole table, so concurrent suites cannot contaminate each other's snapshots."
    - "scheduleIsolation.phase23.test.ts passes 6/6 when run concurrently with scheduleIsolation.phase24.test.ts in a single vitest invocation."
    - "scheduleIsolation.phase24.test.ts exists, targets the current Project-entity data model (BoardCard keyed by projectId), and asserts schedule tables stay byte-identical across a phase-24 schedule-integration operation."
  artifacts:
    - {path: "backend/src/services/__tests__/scheduleIsolation.phase23.test.ts", provides: "isolation-safe phase23 regression suite", contains: "snapshotScheduleTables"}
    - {path: "backend/src/services/__tests__/scheduleIsolation.phase24.test.ts", provides: "restored phase24 isolation suite", contains: "snapshotScheduleTables"}
  key_links:
    - {from: "scheduleIsolation.phase24.test.ts", to: "scheduleIsolation.phase23.test.ts", via: "shares isolation-safe snapshot approach and runs concurrently without collision"}
---
<objective>
Resolve both Phase 24 FAILs and both carried known issues at their shared root. Per the user's authoritative directive, FIX the test isolation rather than accepting it as a process-exception:

1. Eliminate the global-snapshot design flaw in Phase 23's snapshotScheduleTables (unfiltered findMany over Assignment/TeamMember/Absence/Holiday) so two isolation suites can run concurrently without cross-contamination. This resolves BOTH carried known issues at the root (ART-04 driver and DEV-02 driver share this defect).
2. Recreate the undeclared-deleted 24-05 deliverable scheduleIsolation.phase24.test.ts as an isolation-safe test aligned to the current post-0d9ed2b Project-entity data model (BoardCard links to Project, not Assignment). This restores ART-04 and genuinely resolves DEV-02 — the file exists again AND the underlying isolation works, so the original DEVN-05 process-exception condition is truly fixed, not masked by deletion.

Scope is strictly these 2 FAILs + 2 known issues. No product code changes.
</objective>
<context>
@/home/rm/Documents/Layer8-Management-Platform/backend/src/services/__tests__/scheduleIsolation.phase23.test.ts
@/home/rm/Documents/Layer8-Management-Platform/backend/src/services/projectService.ts
@/home/rm/Documents/Layer8-Management-Platform/backend/src/services/assignmentService.ts
Rationale: phase23 test holds the defective snapshotScheduleTables and the seed/teardown pattern the recreated phase24 test must mirror. projectService.upsertByKey + assignmentService.linkProjectsForAssignment define the current Project-entity model and the auto-create-board-card-on-assignment operation the phase24 test exercises. BoardCard.projectId is @unique; one Project = one card.
Recommended Dev-stage skill: Vitest / testing.
</context>
<tasks>
<!-- Tasks are executed sequentially — task N+1 sees the results of task N.
     Order matters: place foundational fixes before dependent ones. -->
<task type="auto">
  <name>Make snapshotScheduleTables isolation-safe in scheduleIsolation.phase23.test.ts</name>
  <files>
    backend/src/services/__tests__/scheduleIsolation.phase23.test.ts
  </files>
  <action>
Replace the unfiltered global findMany in snapshotScheduleTables with reads scoped to the current test's own seeded dataset, so a concurrently-running suite's rows can never appear in this test's snapshot.

- Change snapshotScheduleTables to accept the test's seeded identifiers (the SeedIds object, or at minimum teamMemberId, assignmentId, absenceId, holidayId) and filter each findMany to only those rows:
  - assignment: where { id: ids.assignmentId } (or { teamMemberId: ids.teamMemberId })
  - teamMember:  where { id: ids.teamMemberId }
  - absence:     where { id: ids.absenceId } (or { teamMemberId: ids.teamMemberId })
  - holiday:     where { id: ids.holidayId }
  Keep orderBy { id: 'asc' } and the JSON.stringify serialisation so the byte-equality assertion model is unchanged.
- Update every call site in this file (all six `it` blocks) to pass `ids!` into snapshotScheduleTables.
- Preserve the existing assertion intent: the test still proves the Phase 23 mutations leave Assignment/TeamMember/Absence/Holiday byte-identical; it just no longer reads sibling tests' rows. Keep the focused per-Assignment defence-in-depth check in the archiveCard test as-is.
- Do not change seedDataset, teardownDataset, the uniqueSuffix generator, or any service imports.
  </action>
  <verify>
Run the phase23 suite alone and confirm it still passes 6/6:
`cd backend && npx vitest run scheduleIsolation.phase23`
Then grep the file to confirm no remaining unfiltered findMany inside snapshotScheduleTables:
`cd backend && grep -n "findMany" src/services/__tests__/scheduleIsolation.phase23.test.ts` — every findMany inside snapshotScheduleTables must carry a `where` clause referencing the seeded ids.
  </verify>
  <done>
snapshotScheduleTables is parameterised by the seeded dataset and every read is filtered to those ids; phase23 suite passes 6/6 in isolation.
  </done>
</task>
<task type="auto">
  <name>Recreate scheduleIsolation.phase24.test.ts aligned to the current Project-entity model</name>
  <files>
    backend/src/services/__tests__/scheduleIsolation.phase24.test.ts
  </files>
  <action>
Recreate the deleted 24-05 deliverable as an isolation-safe Phase 24 test that mirrors the phase23 test's intent (Assignment/TeamMember/Absence/Holiday stay byte-identical across a board/schedule operation) but exercises a Phase-24 schedule-integration mutation against the CURRENT data model (BoardCard keyed by Project, not Assignment).

- Reuse the same isolation-safe snapshot approach from Task 1: a snapshotScheduleTables helper that filters reads to the test's own seeded ids (do not reintroduce a global findMany). It is acceptable to copy the scoped helper into this file rather than share an import, to keep the suites independently runnable.
- seedDataset must produce a unique-suffixed dataset: a User, a TeamMember, a Client (required because isPlannerEligible needs a clientId), an Absence, and a Holiday. Do NOT pre-create the Project/BoardCard for the operation under test — let the service create them.
- Exercise the real Phase-24 schedule-integration path: call upsertAssignment (from assignmentService) with a Planner-eligible primary half (name + clientId + at least one tag) so linkProjectsForAssignment → upsertProjectByKey auto-creates the Project and its BoardCard (BoardCard.projectId @unique, one Project = one card). Capture a snapshot of the schedule tables before the upsert and after, and assert byte-equality — proving the auto-create-board-card-on-assignment flow does not mutate the schedule tables beyond the Assignment it is meant to write. (If the operation is expected to write the Assignment row itself, scope the snapshot to the OTHER schedule tables — TeamMember/Absence/Holiday — for the byte-equality assertion, and assert the Assignment's projectId was populated, so the test is meaningful rather than vacuous.)
- teardownDataset must clean up everything created, including the auto-created Project and BoardCard (look them up by the assignment's projectId), in FK-safe order, each wrapped in .catch(() => undefined) like the phase23 teardown. Run cleanup in afterEach so a mid-test failure leaves no rows.
- Use a describe block named for Phase 24 and assertions referencing snapshotScheduleTables, swap/byte-equality, and Phase 24 (ART-04 contains-checks: "snapshotScheduleTables", "swap", "Phase 24").
  </action>
  <verify>
Run the phase24 suite alone and confirm it passes:
`cd backend && npx vitest run scheduleIsolation.phase24`
Confirm the artifact exists and contains the required tokens:
`cd backend && grep -c -e snapshotScheduleTables -e "Phase 24" src/services/__tests__/scheduleIsolation.phase24.test.ts`
  </verify>
  <done>
scheduleIsolation.phase24.test.ts exists, uses the isolation-safe scoped snapshot, drives the auto-create-board-card-on-assignment flow against the Project-entity model, cleans up the auto-created Project/BoardCard, and passes alone.
  </done>
</task>
<task type="auto">
  <name>Confirm both isolation suites pass concurrently in a single vitest run</name>
  <files>
    backend/src/services/__tests__/scheduleIsolation.phase23.test.ts
    backend/src/services/__tests__/scheduleIsolation.phase24.test.ts
  </files>
  <action>
Run both isolation suites together in one invocation so they execute concurrently (the exact scenario that previously caused 4/6 phase23 failures). This is the acceptance gate for both carried known issues.
`cd backend && npx vitest run scheduleIsolation`
If any phase23 test still fails under concurrency, the snapshot scoping in Task 1 (or a stray global read copied into Task 2) is incomplete — find the remaining unfiltered read and scope it. Do not work around the failure by serialising the suites or by changing product code; the fix must be in the test snapshot scoping.
  </action>
  <verify>
The combined run reports all phase23 (6) and all phase24 tests green in the same process. Capture the pass count in the summary.
  </verify>
  <done>
`npx vitest run scheduleIsolation` passes every test in both suites concurrently — phase23 no longer regresses under concurrency.
  </done>
</task>
</tasks>
<verification>
1. `cd backend && npx vitest run scheduleIsolation` passes all tests in both suites concurrently (proves both known issues resolved at the root).
2. `test -f backend/src/services/__tests__/scheduleIsolation.phase24.test.ts` succeeds (ART-04 restored).
3. `grep -n "findMany" backend/src/services/__tests__/scheduleIsolation.phase23.test.ts` shows every snapshot read carrying a `where` clause scoped to seeded ids (no unfiltered global reads).
4. No product/source files outside the two test files were modified (`git diff --name-only` lists only the two scheduleIsolation test files).
</verification>
<success_criteria>
- snapshotScheduleTables in phase23 reads only the test's own seeded rows; phase23 passes 6/6 alone AND concurrently.
- scheduleIsolation.phase24.test.ts exists, is isolation-safe, aligned to the Project-entity model, and passes alone AND concurrently with phase23.
- ART-04 resolved (deleted deliverable restored); DEV-02 resolved (root isolation defect fixed and triggering file restored — no longer an undeclared-deleted process-exception).
- Both carried known issues dispositioned resolved by the snapshot-scoping fix.
- Only the two scheduleIsolation test files changed; no product code touched.
</success_criteria>
<known_issue_workflow>
- Both carried known issues from R01-KNOWN-ISSUES.json are copied verbatim into known_issues_input and each has a matching known_issue_resolutions entry with disposition "resolved".
- Both describe the same root defect (unfiltered global findMany in snapshotScheduleTables); Task 1 fixes that root and Task 3 confirms concurrent green, so both are dispositioned resolved.
</known_issue_workflow>
<output>
R01-SUMMARY.md
</output>
</content>
</invoke>
