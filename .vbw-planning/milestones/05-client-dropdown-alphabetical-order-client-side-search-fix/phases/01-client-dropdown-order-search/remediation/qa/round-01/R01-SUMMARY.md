---
phase: 1
round: 1
title: Correct sort-example prose in 01-01-PLAN (DEVN-01 plan-amendment) + carry pre-existing ESLint known issues
type: remediation
status: complete
completed: 2026-07-08
tasks_completed: 1
tasks_total: 1
commit_hashes:
  - 5a496d31c05f26ca5c5a06b306803c79864dc2da
files_modified:
  - .vbw-planning/phases/01-client-dropdown-order-search/01-01-PLAN.md
deviations:
  - "none"
known_issue_outcomes:
  - '{"test":"eslint react-hooks/set-state-in-effect","file":"frontend/src/features/schedule/components/AssignmentModal.tsx","error":"Calling setState synchronously within an effect (form-reset useEffect, line 124 post-change / 202 on HEAD) — pre-existing on the committed version, in code not touched by this plan","disposition":"accepted-process-exception","rationale":"Pre-existing react-hooks/set-state-in-effect finding in the AssignmentModal form-reset useEffect, reproduced on HEAD. Phase 1 only touched the ClientCombobox call sites, not the effect body, so this is not a regression. Out of scope for this dropdown-order/search phase, non-blocking, and remains visible via the summary/STATE backlog."}'
  - '{"test":"eslint react-hooks/set-state-in-effect","file":"frontend/src/features/schedule/components/AssignmentModal.tsx","error":"Calling setState synchronously within an effect (form-reset useEffect, line 124) — reproduced on HEAD via `npx eslint AssignmentModal.tsx`; pre-existing, in code this plan did not touch (touched lines are the ClientCombobox call sites, not the effect body).","disposition":"accepted-process-exception","rationale":"Same pre-existing react-hooks/set-state-in-effect finding as reported by QA verification, reproduced on HEAD via npx eslint. It lives in untouched code (the form-reset effect); Phase 1 only modified the ClientCombobox call sites. Out of scope for this phase, non-blocking, and stays tracked in the summary/STATE backlog."}'
---

Closed the Phase 1 QA PARTIAL by amending 01-01-PLAN.md's sort-example prose to the correct pt-PT sensitivity:'base' order ['Ácido','acme','Bravo','Zeta'] (DEVN-01 resolved-by-amendment, no product-code change) and carried the two pre-existing AssignmentModal ESLint findings as accepted process exceptions.

## Task 1: Amend 01-01-PLAN sort-example prose and record DEVN-01 resolution

### What Was Built
- Corrected the sort-test task prose in 01-01-PLAN.md: the expected collation order now reads ['Ácido','acme','Bravo','Zeta'], matching the shipped sort.ts helper and sort.test.ts assertions.
- Recorded a DEVN-01 resolved-by-amendment note explaining the prior example was an incorrect illustration; implementation/tests were already correct at 29/30 PASS.
- Verified no product-code or test file was touched (`git status --porcelain frontend/` clean).

### Files Modified
- `.vbw-planning/phases/01-client-dropdown-order-search/01-01-PLAN.md` -- edit: corrected sort-example order prose and appended DEVN-01 resolution note (planning artifact only)

### Known Issue Outcomes
- `eslint react-hooks/set-state-in-effect` (`frontend/src/features/schedule/components/AssignmentModal.tsx`) — `accepted-process-exception`: Pre-existing form-reset useEffect finding reproduced on HEAD; Phase 1 only touched the ClientCombobox call sites, not the effect body. Out of scope, non-blocking, tracked in backlog.
- `eslint react-hooks/set-state-in-effect` (`frontend/src/features/schedule/components/AssignmentModal.tsx`) — `accepted-process-exception`: Same finding reproduced via `npx eslint`, in untouched code (the form-reset effect). Out of scope for this phase, non-blocking, stays tracked.

### Deviations
- None. The round executed R01-PLAN.md exactly: a plan-amendment (DEVN-01 resolved-by-amendment) with no product-code change, which was the planned work — not a deviation from it. (Repo mechanic: `.vbw-planning/` is gitignored, so the amended plan file was committed with `git add -f`.)
