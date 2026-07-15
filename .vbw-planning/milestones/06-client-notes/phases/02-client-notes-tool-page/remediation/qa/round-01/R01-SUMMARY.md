---
phase: 2
round: 1
title: Phase 02 QA Remediation R01 — amend 02-02 plan snippet, accept pre-existing Sidebar ESLint findings
type: remediation
status: complete
completed: 2026-07-10
tasks_completed: 1
tasks_total: 1
commit_hashes:
  - c918e05
  - 037d72e
files_modified:
  - .vbw-planning/phases/02-client-notes-tool-page/02-02-PLAN.md
deviations:
  - "None. DEV-01 (classified plan-amendment) resolved by amending 02-02-PLAN.md to record the as-built onError handler; no frontend/ or backend/ file touched, onError left intact, 82/82 frontend suite unchanged."
known_issue_outcomes:
  - '{"test":"eslint react-hooks/preserve-manual-memoization + exhaustive-deps","file":"frontend/src/components/layout/Sidebar.tsx","error":"Lines 84-87: visibleGroups useMemo flagged for manual-memoization + missing userHasRole dep. Pre-existing on untouched lines; newer react-hooks ruleset flagging long-standing code. Out of scope; not fixed.","disposition":"accepted-process-exception","rationale":"QA independently confirmed via git diff 98c406d..HEAD that lines 84-87 are byte-identical to baseline — Phase 02 only added the NotebookPen import and one nav item. The visibleGroups useMemo governs role-based sidebar group filtering, which has no test coverage; refactoring its memoization/deps to satisfy the newer react-hooks ruleset risks silently changing which groups render. Fixing is out of this phase boundary and unsafe. Repo precedent DEVN-05 (react-refresh/only-export-components on KanbanCard.tsx) is already accepted as non-blocking, establishing legitimate grounds to accept a pre-existing ESLint finding on untouched code."}'
  - '{"test":"eslint react-hooks/preserve-manual-memoization + exhaustive-deps","file":"frontend/src/components/layout/Sidebar.tsx","error":"Lines 84-87: visibleGroups useMemo flagged for manual-memoization + missing userHasRole dep. Verified via git diff 98c406d..HEAD that this phases only Sidebar.tsx edits are the NotebookPen import and the one nav item line; lines 84-87 are untouched.","disposition":"accepted-process-exception","rationale":"Same finding as the 02-03-SUMMARY entry, re-observed at verification time. QA re-confirmed lines 84-87 untouched by Phase 02. The visibleGroups useMemo drives untested role-based group filtering; a memoization/deps rewrite risks behaviour change with no regression net. Out of phase boundary; accepted as non-blocking under the DEVN-05 precedent for pre-existing ESLint findings on code this phase did not modify."}'
  - '{"test":"eslint react-hooks/set-state-in-effect","file":"frontend/src/components/layout/Sidebar.tsx","error":"Line 94: Avoid calling setState() directly within an effect (localStorage collapsed-state load). Pre-existing on code untouched by this plan — git diff 98c406d..HEAD shows my only Sidebar edits are the NotebookPen import and the nav item. Out of scope; not fixed.","disposition":"accepted-process-exception","rationale":"QA independently confirmed via git diff 98c406d..HEAD that line 94 is byte-identical to baseline. This effect hydrates the sidebar collapsed-state from localStorage; reworking it to avoid setState-in-effect (e.g. lazy initial state) risks changing initial collapse behaviour, which has no test coverage. Fixing is out of this phase boundary and unsafe. Accepted as non-blocking under the DEVN-05 precedent for pre-existing ESLint findings on untouched code."}'
  - '{"test":"eslint react-hooks/set-state-in-effect","file":"frontend/src/components/layout/Sidebar.tsx","error":"Line 94: Avoid calling setState() directly within an effect (localStorage collapsed-state load). Verified via git diff 98c406d..HEAD that line 94 is untouched by this phase.","disposition":"accepted-process-exception","rationale":"Same finding as the 02-03-SUMMARY entry, re-observed at verification time. QA re-confirmed line 94 untouched by Phase 02. The effect hydrates collapsed-state from localStorage; a fix risks altering untested initial sidebar collapse behaviour. Out of phase boundary; accepted as non-blocking under the DEVN-05 precedent for pre-existing ESLint findings on code this phase did not modify."}'
---

Closed Phase 02 QA round 01: amended 02-02-PLAN.md to record the as-built `onError` handler (resolving DEV-01 by plan amendment) and carried the four pre-existing Sidebar ESLint findings as accepted-process-exceptions — no product code changed, 82/82 frontend suite intact.

## Task 1: Amend 02-02-PLAN.md to record the as-built onError handler (resolve DEV-01)

### What Was Built
- Added the as-built line `onError: (error: Error) => handleMutationError(error, 'Failed to save client notes'),` to Task 2's `useUpdateClientNotes` snippet, immediately after the `onSuccess` block, so the recorded plan matches `frontend/src/features/schedule/hooks.ts:335-347` byte-for-byte (onSuccess then onError).
- Appended a DEV-01 as-built rationale noting the handler mirrors the identical `handleMutationError` pattern used by all 18 other mutations in `hooks.ts` and does not alter the `mutationFn`/`unwrap('r.client')`/`invalidate(['schedule','client-notes',id])` contract.
- Added a matching `must_haves.truths` entry recording the onError handler and that it does not change the unwrap/invalidate contract (DEV-01 resolved by plan amendment).
- Verified via `git diff` that no `frontend/` or `backend/` file was touched; the onError handler in `hooks.ts` was left exactly as built. Full frontend suite re-run: 82/82 passing across 14 test files.

### Files Modified
- `.vbw-planning/phases/02-client-notes-tool-page/02-02-PLAN.md` -- amend: recorded as-built onError handler in Task 2 snippet + DEV-01 rationale + must_haves truth (documentation-only; no product code)

### Known Issue Outcomes
- `eslint react-hooks/preserve-manual-memoization + exhaustive-deps` (`frontend/src/components/layout/Sidebar.tsx`) — `accepted-process-exception`: lines 84-87 (visibleGroups useMemo) confirmed byte-identical to baseline via git diff 98c406d..HEAD; untested role-based group filtering, unsafe to refactor within this phase boundary; accepted under the DEVN-05 non-blocking-ESLint precedent.
- `eslint react-hooks/preserve-manual-memoization + exhaustive-deps` (`frontend/src/components/layout/Sidebar.tsx`) — `accepted-process-exception`: registry duplicate of the above, re-observed at verification time; lines 84-87 re-confirmed untouched by Phase 02; accepted as non-blocking.
- `eslint react-hooks/set-state-in-effect` (`frontend/src/components/layout/Sidebar.tsx`) — `accepted-process-exception`: line 94 (localStorage collapsed-state effect) confirmed byte-identical to baseline via git diff 98c406d..HEAD; a fix risks altering untested initial sidebar collapse behaviour; accepted under the DEVN-05 precedent.
- `eslint react-hooks/set-state-in-effect` (`frontend/src/components/layout/Sidebar.tsx`) — `accepted-process-exception`: registry duplicate of the above, re-observed at verification time; line 94 re-confirmed untouched by Phase 02; accepted as non-blocking.

### Deviations
None
