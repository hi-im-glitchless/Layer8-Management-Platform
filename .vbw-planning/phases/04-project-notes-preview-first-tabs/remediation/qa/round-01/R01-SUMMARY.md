---
phase: 4
round: 1
title: "Phase 04 QA Remediation R01 — Amend 04-01 Task 3 to document as-built Radix Tabs test approach (DEVN-01 + DEVN-02)"
type: remediation
status: complete
completed: 2026-07-15
tasks_completed: 1
tasks_total: 1
commit_hashes:
  - 1c68de1ac0326e92ad69218224cd2e165c1390fe
files_modified:
  - .vbw-planning/phases/04-project-notes-preview-first-tabs/04-01-PLAN.md
  - .vbw-planning/phases/04-project-notes-preview-first-tabs/remediation/qa/round-01/R01-SUMMARY.md
deviations:
  - "None"
known_issue_outcomes: []
---

Closed QA remediation round 01 for Phase 04 as a plan-amendment round: amended 04-01-PLAN.md Task 3 so its specified test approach matches the delivered, green tests, resolving DEVN-01 and DEVN-02 by amendment. No product code or test file was modified.

## Task 1: Amend 04-01-PLAN.md Task 3 to document the as-built Radix Tabs test approach

### What Was Built
- Amended Task 3's `<action>` to state that any test step activating the Edit tab uses `fireEvent.mouseDown` (NOT `fireEvent.click`), because Radix Tabs triggers activate on mousedown (left button), not a bare click — covering the NotesEditor "keeps Edit functional" case and CardDetailModal case (e) (DEVN-01).
- Amended Task 3's `<action>` to replace the "keep (a)-(d) unchanged" directive with the as-built reality: under `previewFirst` Radix unmounts the inactive Edit tab's content (no `forceMount`), so the project textarea is not in the DOM on mount; therefore CardDetailModal cases (a)/(b) incidental project-notes assertions use `getByText('Project note body')` (Preview markdown) instead of `getByDisplayValue('Project note body')` (textarea), while the client-notes assertions and cases (c)/(d) remain unchanged (DEVN-02).
- Added an "AMENDMENTS / RESOLVED DEVIATIONS" note to Task 3 marking DEVN-01 and DEVN-02 as resolved-by-amendment, and updated Task 3's `<verify>`/`<done>` to reflect the mousedown activation and getByText/unmount rationale so the plan's specified approach now matches the delivered SUMMARY's declared deviations.

### Files Modified
- `.vbw-planning/phases/04-project-notes-preview-first-tabs/04-01-PLAN.md` -- edited: amended Task 3 (`<action>`/`<verify>`/`<done>`) to document the as-built mousedown Edit-tab activation and the previewFirst-driven unmount → getByText assertions, marking DEVN-01/DEVN-02 resolved-by-amendment.
- `.vbw-planning/phases/04-project-notes-preview-first-tabs/remediation/qa/round-01/R01-SUMMARY.md` -- created: this remediation round summary.

### Deviations
None