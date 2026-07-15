---
phase: 1
round: 1
title: Plan-Amendment Remediation — Document SplitCell group class and test import depth (DEVN-01a, DEVN-01b)
type: remediation
status: complete
completed: 2026-06-23
tasks_completed: 1
tasks_total: 1
commit_hashes:
  - 8221911
files_modified:
  - .vbw-planning/phases/01-pm-project-delete-and-lock/01-02-PLAN.md
deviations:
  - none
known_issue_outcomes:
  - '{"test":"eslint prefer-const","file":"frontend/src/features/schedule/components/ColorPalette.tsx:31-33","error":"r/g/b are never reassigned, use const — pre-existing in hexToHsl (authored 2026-03-25, commit 16b0c336); unrelated to the disabled prop added in plan 01-02","disposition":"accepted-process-exception","rationale":"Pre-existing lint in hexToHsl (commit 16b0c336, 2026-03-25), unrelated to phase-01 changes per git blame. Fixing pre-existing lint in untouched code is out of scope for this phase; accepted as non-blocking."}'
  - '{"test":"eslint prefer-const","file":"frontend/src/features/schedule/components/ColorPalette.tsx:31-33","error":"r/g/b are never reassigned, use const — pre-existing in hexToHsl authored 2026-03-25 (commit 16b0c336); unrelated to the disabled prop added in plan 01-02","disposition":"accepted-process-exception","rationale":"Pre-existing lint in hexToHsl (commit 16b0c336, 2026-03-25), unrelated to phase-01 changes per git blame. Fixing pre-existing lint in untouched code is out of scope for this phase; accepted as non-blocking."}'
  - '{"test":"eslint react-hooks/set-state-in-effect","file":"frontend/src/features/schedule/components/AssignmentModal.tsx:199","error":"Avoid calling setState() directly within an effect — pre-existing open-reset useEffect (authored 2026-03-18, commit 6d0b71ff); not in any line changed in plan 01-02","disposition":"accepted-process-exception","rationale":"Pre-existing open-reset useEffect (commit 6d0b71ff, 2026-03-18), not in any line changed by plan 01-02 per git blame. Out of scope for this phase; accepted as non-blocking."}'
  - '{"test":"eslint react-hooks/set-state-in-effect","file":"frontend/src/features/schedule/components/AssignmentModal.tsx:199","error":"Avoid calling setState() directly within an effect — pre-existing open-reset useEffect authored 2026-03-18 (commit 6d0b71ff); not in any line changed in plan 01-02","disposition":"accepted-process-exception","rationale":"Pre-existing open-reset useEffect (commit 6d0b71ff, 2026-03-18), not in any line changed by plan 01-02 per git blame. Out of scope for this phase; accepted as non-blocking."}'
---

Resolved the two FAIL rows (DEVN-01a, DEVN-01b) as plan-amendments only — enriched plan 01-02 task <action> blocks to document the delivered, correct approach; no product or test source code touched or reverted.

## Task 1: Amend plan 01-02 to document the SplitCell `group` class and the test import depth (DEVN-01a, DEVN-01b)

### What Was Built
- Task 1 <action> amended: documents that the SplitCell wrapper div MUST carry the `group` CSS class so the hover-reveal lock button's `group-hover:opacity-60` resolves, mirroring the non-split branch; marked resolved-by-amendment (DEVN-01a).
- Tasks 3 & 4 <action> amended: document that the `Assignment` type import in each `__tests__/` file MUST use `../../types` (one level deeper than the component dir); marked resolved-by-amendment (DEVN-01b).

### Files Modified
- `.vbw-planning/phases/01-pm-project-delete-and-lock/01-02-PLAN.md` -- edited: enriched task 1, 3, and 4 `<action>` blocks with the `group` wrapper-class requirement and the `../../types` import-depth requirement, plus resolved-by-amendment notes for both deviations. Original wording retained; only additive.

### Known Issue Outcomes
- `eslint prefer-const` (`frontend/src/features/schedule/components/ColorPalette.tsx:31-33`) — `accepted-process-exception`: pre-existing lint in hexToHsl (commit 16b0c336, 2026-03-25), unrelated to phase-01; out of scope, non-blocking.
- `eslint react-hooks/set-state-in-effect` (`frontend/src/features/schedule/components/AssignmentModal.tsx:199`) — `accepted-process-exception`: pre-existing open-reset useEffect (commit 6d0b71ff, 2026-03-18), not in any line changed by plan 01-02; out of scope, non-blocking.

### Deviations
None. This round executed R01-PLAN exactly (plan-amendment only). DEVN-01a/DEVN-01b are the original deviations resolved by the amendment — recorded in R01-PLAN `fail_classifications` and the What Was Built section above, not as deviations of this round.
