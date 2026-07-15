---
phase: 1
round: 1
plan_count: 1
status: issues_found
started: 2026-06-23
completed: 2026-06-23
total_tests: 1
passed: 0
skipped: 0
issues: 1
---

Re-verification UAT for Phase 01 round 01 — remediation of P01-T01 ("deleted the card from the planner and it stayed in board"). The fix clarifies the planner delete and surfaces silent cleanup failures: deleting a planner assignment now shows a confirmation dialog explaining the project's Board card is only removed when this is its *last* assignment, and if the board-card cleanup fails on a last-assignment delete the user gets a warning toast instead of a silent success. A Selenium replay is at `ui-seed/uat_replay_25.py` (run after `seed_all.py`).

## Tests

### PR01-T01: Planner delete confirmation clarifies the board-card removal rule

- **Plan:** R01 -- Surface orphan-guard failures + clarify planner-delete UX (UAT P01-T01)
- **Scenario:** Log in as PM, go to /schedule, open an assignment's edit modal, and click "Delete". Read the new confirmation dialog. (a) For a project that has another assignment elsewhere, confirm the delete — the schedule entry is removed but the project's Board card correctly remains. (b) For a project whose only assignment is this one, confirm the delete — the Board card is removed too. The earlier confusion ("deleted in planner, card stayed on Board") should now be explained by the dialog copy rather than feeling broken.
- **Expected:** Clicking Delete opens a confirmation dialog (Cancel aborts with no change). The dialog copy clearly states that deleting this assignment removes the schedule entry, and the project's Board card is only removed when this is the project's last assignment — otherwise the card stays. After confirming, behavior matches that copy: a multi-assignment project keeps its card; a last-assignment project loses its card. If the board-card cleanup ever fails, a warning toast appears (not a silent success). The behavior is now understandable, not a defect.
- **Result:** issue
- **Issue:**
  - Description: Delete propagation between the schedule and planner surfaces is one-directional. Deleting an assignment from the schedule view correctly removes it from the planner, but deleting the assignment from the planner does NOT remove the corresponding schedule entry — the schedule still shows the deleted assignment. Deletion should be consistent in both directions: a planner delete must also remove the schedule entry.
  - Severity: major
