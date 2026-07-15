---
phase: 1
round: 1
plan: R01
title: Plan-Amendment Remediation — Document SplitCell group class and test import depth (DEVN-01a, DEVN-01b)
type: remediation
autonomous: true
effort_override: balanced
skills_used: []
files_modified:
  - .vbw-planning/phases/01-pm-project-delete-and-lock/01-02-PLAN.md
forbidden_commands: []
fail_classifications:
  - {id: "DEVN-01a", type: "plan-amendment", rationale: "Plan 01-02 task 1 said to mirror the non-split lock pattern but omitted the explicit step of adding the `group` CSS class to the SplitCell wrapper div. The dev correctly added `group` to the wrapper (AssignmentCell.tsx) so `group-hover:opacity-60` on the hover-reveal lock button resolves, exactly as the non-split branch already does. The delivered code is correct and necessary; the resolution is to amend the original plan to document this step, not to revert.", source_plan: "01-02-PLAN.md"}
  - {id: "DEVN-01b", type: "plan-amendment", rationale: "Plan 01-02 tasks 3 & 4 did not specify the `Assignment` type import path for the new `__tests__/` files. The dev corrected `../types` to `../../types` (the test files sit one directory deeper), a correctness fix caught by tsc. The delivered code is correct; the resolution is to amend the original plan to specify the import depth, not to revert.", source_plan: "01-02-PLAN.md"}
known_issues_input:
  - '{"test":"eslint prefer-const","file":"frontend/src/features/schedule/components/ColorPalette.tsx:31-33","error":"r/g/b are never reassigned, use const — pre-existing in hexToHsl (authored 2026-03-25, commit 16b0c336); unrelated to the disabled prop added in plan 01-02"}'
  - '{"test":"eslint prefer-const","file":"frontend/src/features/schedule/components/ColorPalette.tsx:31-33","error":"r/g/b are never reassigned, use const — pre-existing in hexToHsl authored 2026-03-25 (commit 16b0c336); unrelated to the disabled prop added in plan 01-02"}'
  - '{"test":"eslint react-hooks/set-state-in-effect","file":"frontend/src/features/schedule/components/AssignmentModal.tsx:199","error":"Avoid calling setState() directly within an effect — pre-existing open-reset useEffect (authored 2026-03-18, commit 6d0b71ff); not in any line changed in plan 01-02"}'
  - '{"test":"eslint react-hooks/set-state-in-effect","file":"frontend/src/features/schedule/components/AssignmentModal.tsx:199","error":"Avoid calling setState() directly within an effect — pre-existing open-reset useEffect authored 2026-03-18 (commit 6d0b71ff); not in any line changed in plan 01-02"}'
known_issue_resolutions:
  - '{"test":"eslint prefer-const","file":"frontend/src/features/schedule/components/ColorPalette.tsx:31-33","error":"r/g/b are never reassigned, use const — pre-existing in hexToHsl (authored 2026-03-25, commit 16b0c336); unrelated to the disabled prop added in plan 01-02","disposition":"accepted-process-exception","rationale":"Pre-existing lint in hexToHsl (commit 16b0c336, 2026-03-25), unrelated to phase-01 changes per git blame. Fixing pre-existing lint in untouched code is out of scope for this phase; accepted as non-blocking."}'
  - '{"test":"eslint prefer-const","file":"frontend/src/features/schedule/components/ColorPalette.tsx:31-33","error":"r/g/b are never reassigned, use const — pre-existing in hexToHsl authored 2026-03-25 (commit 16b0c336); unrelated to the disabled prop added in plan 01-02","disposition":"accepted-process-exception","rationale":"Pre-existing lint in hexToHsl (commit 16b0c336, 2026-03-25), unrelated to phase-01 changes per git blame. Fixing pre-existing lint in untouched code is out of scope for this phase; accepted as non-blocking."}'
  - '{"test":"eslint react-hooks/set-state-in-effect","file":"frontend/src/features/schedule/components/AssignmentModal.tsx:199","error":"Avoid calling setState() directly within an effect — pre-existing open-reset useEffect (authored 2026-03-18, commit 6d0b71ff); not in any line changed in plan 01-02","disposition":"accepted-process-exception","rationale":"Pre-existing open-reset useEffect (commit 6d0b71ff, 2026-03-18), not in any line changed by plan 01-02 per git blame. Out of scope for this phase; accepted as non-blocking."}'
  - '{"test":"eslint react-hooks/set-state-in-effect","file":"frontend/src/features/schedule/components/AssignmentModal.tsx:199","error":"Avoid calling setState() directly within an effect — pre-existing open-reset useEffect authored 2026-03-18 (commit 6d0b71ff); not in any line changed in plan 01-02","disposition":"accepted-process-exception","rationale":"Pre-existing open-reset useEffect (commit 6d0b71ff, 2026-03-18), not in any line changed by plan 01-02 per git blame. Out of scope for this phase; accepted as non-blocking."}'
must_haves:
  truths:
    - "Both DEVN-01a and DEVN-01b are resolved by amending plan 01-02-PLAN.md to document the actual, correct approach; no product or test source code is reverted or modified"
    - "Plan 01-02 task 1 <action> explicitly states the SplitCell wrapper div must carry the `group` class so `group-hover` on the hover-reveal lock button resolves, mirroring the non-split branch"
    - "Plan 01-02 tasks 3 & 4 <action> explicitly state the `Assignment` type imports in the `__tests__/` files use `../../types` (one level deeper than `../types`)"
    - "Both deviations are marked resolved-by-amendment in the plan text"
  artifacts:
    - path: ".vbw-planning/phases/01-pm-project-delete-and-lock/01-02-PLAN.md"
      provides: "amended task 1 action documenting the `group` wrapper class, and amended tasks 3 & 4 actions documenting the `../../types` import depth, with resolved-by-amendment notes"
      contains: "group"
  key_links:
    - from: ".vbw-planning/phases/01-pm-project-delete-and-lock/remediation/qa/round-01/R01-PLAN.md"
      to: ".vbw-planning/phases/01-pm-project-delete-and-lock/01-02-PLAN.md"
      via: "plan-amendment task documenting DEVN-01a and DEVN-01b as resolved-by-amendment"
---
<objective>
Resolve the two FAIL rows from 01-VERIFICATION.md (DEVN-01a, DEVN-01b) as plan-amendments. In both cases the delivered code is correct and necessary; the original plan 01-02 was underspecified. The only change in this round is a planning-artifact edit to 01-02-PLAN.md that documents the actual approach the dev took, so the plan and the code agree. No product or test source code is modified — nothing is reverted.
</objective>
<context>
@.vbw-planning/phases/01-pm-project-delete-and-lock/01-VERIFICATION.md
@.vbw-planning/phases/01-pm-project-delete-and-lock/01-02-PLAN.md
Rationale: 01-VERIFICATION.md rows 13 (DEVN-01a) and 14 (DEVN-01b) are the two FAILs; both are minor deviations recorded in 02-SUMMARY.md where the dev refined the plan with correct, necessary changes (the `group` wrapper class for group-hover to resolve, and the `../../types` import depth for the deeper `__tests__/` directory). 01-02-PLAN.md is the artifact to amend: task 1 mirrors the non-split lock pattern (the `group` class is part of that pattern), and tasks 3 & 4 create the two new test files that import the `Assignment` type.
</context>
<tasks>
<task type="auto">
  <name>Amend plan 01-02 to document the SplitCell `group` class and the test import depth (DEVN-01a, DEVN-01b)</name>
  <files>
    .vbw-planning/phases/01-pm-project-delete-and-lock/01-02-PLAN.md
  </files>
  <action>
Edit .vbw-planning/phases/01-pm-project-delete-and-lock/01-02-PLAN.md. This is a planning-artifact edit only — do NOT touch any product or test source code.

(a) DEVN-01a: In task 1's <action> (the "Add clickable lock toggle to SplitCell and thread onLockToggle" task), add an explicit step stating that the SplitCell wrapper div must carry the `group` CSS class so the hover-reveal lock button's `group-hover:opacity-60` resolves, exactly as the non-split branch already does. Place this near the part that describes the canEdit && !isLocked hover-visible case (which uses opacity-0 group-hover:opacity-60). Make clear `group` on the wrapper is required for hover reveal, not optional. Append a brief inline note that this documents DEVN-01a as resolved-by-amendment (delivered code in AssignmentCell.tsx is correct and retained).

(b) DEVN-01b: In task 3's <action> and task 4's <action> (the two new `__tests__/` test files), add an explicit step stating that the `Assignment` type import in each test file must use `../../types` (not `../types`), because the `__tests__/` subdirectory sits one level deeper than the component directory. Append a brief inline note that this documents DEVN-01b as resolved-by-amendment (delivered import fixes in AssignmentCell.split-lock.test.tsx and AssignmentModal.lock.test.tsx are correct and retained).

Do not change 01-02-PLAN.md frontmatter, must_haves, verification, or success_criteria semantics — only enrich the named task <action> blocks and add the resolved-by-amendment notes. Keep the original wording intact; add to it.
  </action>
  <verify>
grep -n "group" in 01-02-PLAN.md task 1 action shows the new wrapper-class requirement. grep -n "../../types" in 01-02-PLAN.md shows the import-depth requirement in tasks 3 and 4. grep -n "resolved-by-amendment" (or "DEVN-01a"/"DEVN-01b") in 01-02-PLAN.md shows both deviations are noted. No product or test source files appear in git status — only 01-02-PLAN.md is modified.
  </verify>
  <done>
01-02-PLAN.md task 1 documents the required `group` wrapper class for group-hover; tasks 3 & 4 document the `../../types` import depth; both DEVN-01a and DEVN-01b are marked resolved-by-amendment. Only the planning artifact changed. One commit: docs(planning): amend plan 01-02 to document SplitCell group class and test import depth (DEVN-01a, DEVN-01b).
  </done>
</task>
</tasks>
<verification>
1. grep -n "group" in 01-02-PLAN.md task 1 <action> shows the SplitCell wrapper `group` class requirement (DEVN-01a).
2. grep -n "../../types" in 01-02-PLAN.md shows the import-depth requirement added to tasks 3 and 4 (DEVN-01b).
3. grep -n "resolved-by-amendment" in 01-02-PLAN.md matches for both deviations.
4. git diff touches only .vbw-planning/phases/01-pm-project-delete-and-lock/01-02-PLAN.md — no product or test source code changed, nothing reverted.
</verification>
<success_criteria>
- DEVN-01a is resolved: plan 01-02 task 1 documents that the SplitCell wrapper div must carry the `group` class so `group-hover` resolves, matching the delivered (correct) code.
- DEVN-01b is resolved: plan 01-02 tasks 3 & 4 document that the `Assignment` type imports in the `__tests__/` files use `../../types`, matching the delivered (correct) code.
- Both deviations are marked resolved-by-amendment in 01-02-PLAN.md; no product or test source code is reverted or modified.
- The four carried pre-existing ESLint known issues are accepted as non-blocking process exceptions (out of scope for this phase).
</success_criteria>
<known_issue_workflow>
- known_issues_input mirrors all four carried entries from R01-KNOWN-ISSUES.json exactly (two distinct issues, each listed twice with slightly different wording — duplicates preserved).
- known_issue_resolutions provides a matching entry for every carried known issue with disposition accepted-process-exception: both are real but pre-existing ESLint findings in code untouched by phase 01 (ColorPalette.tsx hexToHsl, commit 16b0c336; AssignmentModal.tsx open-reset useEffect, commit 6d0b71ff), out of scope for this phase.
- No known issue is dropped or newly fixed this round.
</known_issue_workflow>
<output>
R01-SUMMARY.md
</output>
