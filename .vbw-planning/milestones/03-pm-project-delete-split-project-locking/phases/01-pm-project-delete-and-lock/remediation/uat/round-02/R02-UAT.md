---
phase: 1
round: 2
plan_count: 1
status: complete
started: 2026-06-23
completed: 2026-06-23
total_tests: 2
passed: 2
skipped: 0
issues: 0
---

Re-verification UAT for Phase 01 round 02 — remediation of the round-01 issue "deleting on planner still doesn't delete on schedule". The fix implements the product owner's two-operation delete model: deleting a project from the board (board card) now cascades to delete the project and ALL its schedule assignments (for every pentester) and refreshes both the board and the schedule; deleting a single schedule assignment still only removes that one user's assignment. A locked linked assignment blocks the whole card delete (nothing is removed).

## Tests

### PR02-T01: Deleting a project from the board removes all its schedule assignments

- **Plan:** R02 — Planner card delete cascades project + all linked assignments to schedule
- **Scenario:** Pick a project that has at least one schedule assignment (ideally one with assignments for two different pentesters). Open its card on the board and click Delete. Read the confirmation dialog, then confirm. Now look at the /schedule view.
- **Expected:** The confirmation dialog clearly warns that deleting the card removes the project and all its linked schedule assignments (and shows how many / says "for all pentesters") — not the old "assignments are not affected" wording. After confirming, the card disappears from the board AND every one of that project's assignments disappears from the schedule (for all pentesters), with both views refreshing on their own. This is the behavior that was broken before.
- **Result:** pass

### PR02-T02: Deleting a single schedule assignment only removes that user's assignment

- **Plan:** R02 — Planner card delete cascades project + all linked assignments to schedule
- **Scenario:** Pick a project that has assignments for two different pentesters. On /schedule, open ONE pentester's assignment for that project and delete it (the round-01 confirmation dialog should appear). Then check the other pentester's assignment and the project's board card.
- **Expected:** Only the one pentester's assignment is removed. The other pentester's assignment for the same project stays, and the project's board card stays (because it was not the last assignment). The round-01 confirmation dialog and the orphan-cleanup warning toast behavior are unchanged. Deleting a single assignment must NOT wipe the whole project.
- **Result:** pass
