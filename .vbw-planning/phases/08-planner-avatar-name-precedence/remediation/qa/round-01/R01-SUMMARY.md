---
phase: 8
round: 1
title: Amend 08-01-PLAN.md to record correct backlog-alias initials behaviour (Futuro 1 -> F1)
type: remediation
status: complete
completed: 2026-06-11
tasks_completed: 1
tasks_total: 1
commit_hashes:
  - 8600617b3c83a0a49d81ea234d184f1e1ed67eb0
files_modified:
  - .vbw-planning/phases/08-planner-avatar-name-precedence/08-01-PLAN.md
deviations: []
known_issue_outcomes: []
---

Resolved QA FAIL DEV-01 (DEVN-01) by amending the original phase-08 plan so its stated backlog-alias initials expectation matches the already-correct, QA-verified implementation and tests; no product/source/test code was touched.

## Task 1: Amend 08-01-PLAN.md: backlog alias 'Futuro 1' -> 'F1', mononym 'Futuro' -> 'F'; mark DEVN-01 resolved-by-amendment

### What Was Built
- Corrected every occurrence (must_haves truth #3 ~L23, Task-2 action ~L109, Task-2 done line ~L124, success-criteria ~L137) where the two-token alias "Futuro 1" was wrongly said to render the single monogram "F"; the plan now states "Futuro 1" yields the two-initial monogram "F1" (first + last initial via the unchanged Phase-07 whitespace splitter).
- Recorded that a true single-token mononym alias (e.g. "Futuro") yields the single initial "F", matching the test's added mononym case.
- Added a DEVN-01 resolved-by-amendment note on the amended truth: the plan expectation was corrected to agree with the already-correct implementation and tests; no product/test code changed.
- Left KanbanCard.tsx and KanbanCard.test.tsx untouched — they are already correct and QA-verified.

### Files Modified
- `.vbw-planning/phases/08-planner-avatar-name-precedence/08-01-PLAN.md` -- edit: corrected the backlog-alias initials expectation to "Futuro 1" -> "F1" (mononym "Futuro" -> "F") at all four prior locations and recorded DEVN-01 as resolved-by-amendment.

### Deviations
None
