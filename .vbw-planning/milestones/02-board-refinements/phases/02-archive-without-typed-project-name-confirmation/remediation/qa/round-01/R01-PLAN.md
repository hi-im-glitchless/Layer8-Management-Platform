---
phase: 2
round: 1
plan: R01
title: Disposition carried SQLite concurrent-run known issue for boardAdminArchive route test
type: remediation
autonomous: true
effort_override: fast
skills_used: []
files_modified:
  - .vbw-planning/phases/02-archive-without-typed-project-name-confirmation/remediation/qa/round-01/R01-PLAN.md
  - .vbw-planning/phases/02-archive-without-typed-project-name-confirmation/remediation/qa/round-01/R01-SUMMARY.md
forbidden_commands: []
fail_classifications: []
known_issues_input:
  - '{"test":"archives the card with an empty body and a valid ADMIN session → 200","file":"backend/src/routes/__tests__/boardAdminArchive.test.ts","error":"SQLite SocketTimeout (PrismaClientKnownRequestError: DriverAdapterError: SocketTimeout) when boardAdminArchive.test.ts and scheduleIsolation.phase23.test.ts run concurrently — identical to the accepted concurrent-run contention documented in STATE.md. Both suites pass in isolation."}'
known_issue_resolutions:
  - '{"test":"archives the card with an empty body and a valid ADMIN session → 200","file":"backend/src/routes/__tests__/boardAdminArchive.test.ts","error":"SQLite SocketTimeout (PrismaClientKnownRequestError: DriverAdapterError: SocketTimeout) when boardAdminArchive.test.ts and scheduleIsolation.phase23.test.ts run concurrently — identical to the accepted concurrent-run contention documented in STATE.md. Both suites pass in isolation.","disposition":"accepted-process-exception","rationale":"Environmental SQLite single-writer contention, not a product or test defect. The new test ALREADY implements the only in-scope hardening: every seed and teardown write in boardAdminArchive.test.ts is wrapped in a local withDbRetry jittered-backoff helper mirroring scheduleIsolation upsertAssignmentWithRetry. Both boardAdminArchive.test.ts and scheduleIsolation.phase23.test.ts pass in isolation; the SocketTimeout only surfaces when they share a parallel vitest worker against the single SQLite writer (compounded by the better-sqlite3 NODE_MODULE_VERSION mismatch under Node v22.x). The archive product behavior is correct (200 archive + hard-delete of BoardFile rows and on-disk bytes; 404 NOT_FOUND for missing card). STATE.md already accepts this exact concurrent-run contention class for phases 23, 24, and 01. Further changes (vitest pool config, per-test isolated DB, retry-wrapping read assertions) are out-of-scope and risk destabilizing the wider suite. Disposition: accepted non-blocking process-exception for phase 2."}'
must_haves:
  truths:
    - "boardAdminArchive.test.ts (both cases) passes when run in isolation."
    - "The carried SQLite SocketTimeout known issue is dispositioned accepted-process-exception and is non-blocking for phase 2."
    - "No product code and no test code is modified in this round — disposition is documentation-only."
  artifacts:
    - path: ".vbw-planning/phases/02-archive-without-typed-project-name-confirmation/remediation/qa/round-01/R01-SUMMARY.md"
      provides: "Recorded disposition of the carried known issue"
      contains: "accepted-process-exception"
  key_links:
    - from: "R01-SUMMARY.md known_issue_outcomes"
      to: "R01-KNOWN-ISSUES.json issue"
      via: "matching test+file disposition"
---
<objective>
Disposition the single carried known issue for phase 2: the SQLite `SocketTimeout`
that occurs only when `backend/src/routes/__tests__/boardAdminArchive.test.ts` runs
concurrently with `scheduleIsolation.phase23.test.ts` under parallel vitest workers.
Both suites pass in isolation. The new archive route test already wraps every
seed/teardown write in a `withDbRetry` jittered-backoff helper (the only low-risk,
in-scope hardening available), so no further code change is warranted. Classify the
issue as an `accepted-process-exception` — an environmental SQLite single-writer
contention class already accepted in STATE.md for phases 23, 24, and 01 — and record
the disposition so QA treats it as a verified non-blocking carryover.
</objective>
<context>
@.vbw-planning/phases/02-archive-without-typed-project-name-confirmation/remediation/qa/round-01/R01-KNOWN-ISSUES.json
@backend/src/routes/__tests__/boardAdminArchive.test.ts
@.vbw-planning/STATE.md
</context>
<tasks>
<task type="auto">
  <name>Record accepted-process-exception disposition for the carried SQLite concurrent-run issue</name>
  <files>
    .vbw-planning/phases/02-archive-without-typed-project-name-confirmation/remediation/qa/round-01/R01-SUMMARY.md
  </files>
  <action>
Confirm the disposition rationale by inspecting the existing hardening, then document it
in R01-SUMMARY.md. Do NOT modify boardAdminArchive.test.ts or any product code.

1. Verify the new test already implements the only in-scope hardening:
   - Open backend/src/routes/__tests__/boardAdminArchive.test.ts and confirm `withDbRetry`
     (jittered backoff matching /timed out|database is locked|SQLITE_BUSY/) wraps every
     seed write (user/project/boardCard/boardFile create) and every teardown deleteMany.
   - Confirm both `it(...)` cases pass in isolation:
       cd backend && npx vitest run src/routes/__tests__/boardAdminArchive.test.ts
2. In R01-SUMMARY.md, add a `known_issue_outcomes` entry for the carried issue with
   `disposition: accepted-process-exception` and a rationale that states, specifically:
   - both suites pass in isolation; the SocketTimeout only appears when they share a
     parallel vitest worker against the single SQLite writer;
   - the new test already wraps all seed/teardown writes in withDbRetry backoff (no further
     low-risk in-scope hardening exists; broader vitest-pool / isolated-DB changes are
     out-of-scope scope-creep);
   - the archive product behavior is correct (200 archive + hard-delete; 404 NOT_FOUND);
   - STATE.md already accepts this identical concurrent-run contention class for phases
     23, 24, and 01 (better-sqlite3 NODE_MODULE_VERSION mismatch under Node v22.x).
3. The keys (test, file, error) in the outcome MUST match R01-KNOWN-ISSUES.json exactly.
  </action>
  <verify>
- `cd backend && npx vitest run src/routes/__tests__/boardAdminArchive.test.ts` → both tests pass (isolation).
- R01-SUMMARY.md contains a known_issue_outcomes entry whose test+file match
  R01-KNOWN-ISSUES.json and whose disposition is `accepted-process-exception`.
- `git diff --stat backend/` is empty (no product/test code changed this round).
  </verify>
  <done>
The carried known issue is recorded in R01-SUMMARY.md as accepted-process-exception with a
specific, honest rationale; the new archive route test still passes in isolation; no code
was modified.
  </done>
</task>
</tasks>
<verification>
1. boardAdminArchive.test.ts passes in isolation (both cases) via `npx vitest run`.
2. R01-SUMMARY.md `known_issue_outcomes` covers the one carried issue with disposition
   `accepted-process-exception` and keys matching R01-KNOWN-ISSUES.json.
3. `git diff --stat backend/ frontend/` is empty — disposition is documentation-only.
</verification>
<success_criteria>
- The single carried SQLite SocketTimeout known issue is dispositioned as a verified,
  non-blocking accepted-process-exception for phase 2.
- The new archive route test passes in isolation and retains its existing withDbRetry
  hardening; no further code change is introduced.
- The disposition rationale is specific (isolation-pass, existing hardening, correct
  product behavior, STATE.md precedent) rather than a rubber stamp.
</success_criteria>
<known_issue_workflow>
- `known_issues_input` carries the one issue from R01-KNOWN-ISSUES.json verbatim (canonical {test,file,error} shape).
- `known_issue_resolutions` has exactly one matching entry with disposition `accepted-process-exception`.
- No FAIL rows this round (`fail_classifications: []`); this is a known-issues-only remediation.
</known_issue_workflow>
<output>
R01-SUMMARY.md
</output>
