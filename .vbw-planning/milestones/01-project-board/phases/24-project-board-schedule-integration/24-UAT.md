---
phase: 24
plan_count: 2
status: complete
started: 2026-06-03
completed: 2026-06-03
total_tests: 6
passed: 6
skipped: 0
issues: 0
---

UAT for Phase 24 — Project Board: Schedule Integration & Navigation. Covers the
"View on Board" link, pentester schedule-cell navigation, Dashboard project-card
links, auto-creation of board cards on assignment, schedule→board date sync, and
the role-aware board default filter. Driven interactively (guided checkpoints);
a Selenium replay is available at ui-seed/uat_replay_24.py. One usability fix was
made inline during UAT (see P24-T02).

## Tests

### P24-T01: Assignment edit modal shows "View on Board" link

- **Plan:** 24 — schedule→board navigation
- **Scenario:** As a PM, open the Schedule, edit an assignment whose project has a board card; look for and click "View on Board".
- **Expected:** the link shows only when a board card exists and opens /board?card=<id> on that card.
- **Result:** pass

### P24-T02: Pentester clicks schedule cell -> project card on Board

- **Plan:** 24 — ScheduleGrid pentester navigation
- **Scenario:** As a pentester (NORMAL), click one of your own assignment cells on the Schedule.
- **Expected:** hovering an own navigable cell shows the pointer cursor; clicking navigates to /board?card=<id> with the card open.
- **Result:** pass
- **Resolution:** UAT surfaced a missing cursor affordance — own navigable cells were clickable but showed no pointer cursor. Fixed inline (commit b603ce9): added `cursor-pointer` to a pentester's own navigable assignment cell (scoped to role==='NORMAL' + own assignment + projectId, mirroring the navigation condition) in ScheduleGrid.tsx. tsc clean. User re-verified: pointer shows and navigation works.

### P24-T03: Dashboard Current/Next project card links to Board card

- **Plan:** 24-04 — Dashboard ProjectCard -> /board?card=<id>
- **Scenario:** As a pentester with a current-week assignment, open the Dashboard and click the Current Project card.
- **Expected:** the Dashboard project card links to and opens the matching Board card.
- **Result:** pass
- **Note:** The Dashboard shows the logged-in user's OWN current/next projects (useMyAssignments). Users with no current/upcoming assignment (e.g., PMs, or pentesters with only past-dated assignments) correctly see an empty state — this is expected, not a defect.

### P24-T04: Creating a schedule assignment auto-creates a Board card

- **Plan:** 24 — assignmentService -> linkProjectsForAssignment -> upsertByKey
- **Scenario:** As a PM, create a Planner-eligible assignment (name + client + tags) for a project with no card; then open /board.
- **Expected:** a Board card for that project is auto-created in Upcoming; same-project reuse does not duplicate.
- **Result:** pass
- **Note (non-blocking follow-up):** the auto-created card appears after a board reload — creating an assignment on the Schedule does not live-invalidate an already-open Board view (no schedule→board cache push). The card IS created server-side immediately (Project + BoardCard, stage=upcoming). Consider emitting a board 'cards' invalidation from the assignment auto-create path so the Board updates without a manual reload.

### P24-T05: Changing schedule dates updates Board card dates

- **Plan:** 24 — schedule/board date sync
- **Scenario:** As a PM, edit an assignment's week/dates on the Schedule and save; open the matching Board card.
- **Expected:** the Board card's dates/week reflect the schedule change.
- **Result:** pass

### P24-T06: Board default filter is role-aware

- **Plan:** 24-05 — Board.tsx role-aware default filter
- **Scenario:** Open /board as a PM/Admin and as a pentester.
- **Expected:** PM/Admin default to "All Projects"; pentesters default to "My Projects" (mine).
- **Result:** pass

## Summary

- Passed: 6
- Skipped: 0
- Issues: 0
- Total: 6
