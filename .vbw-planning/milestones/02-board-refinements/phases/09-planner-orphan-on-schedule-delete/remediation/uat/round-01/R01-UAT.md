---
phase: 9
plan_count: 1
status: complete
started: 2026-06-12
completed: 2026-06-12
total_tests: 2
passed: 2
skipped: 0
issues: 0
round: 1
verify_scope: remediation
---

UAT re-verification (round 01) for Phase 09 after the remediation fix: deleting the
**last** pentester's assignment for a project now **hard-deletes** the project and its
card (cascade: card + comments/files/checklist/notes) instead of moving it to
'Stopped'. Multi-pentester projects remain untouched. Replay: `ui-seed/uat_replay_09.py`.

## Tests

### P01-T01: Last-pentester schedule delete DELETES the project card

- **Plan:** 09-01 (remediated)
- **Scenario:** In the Schedule, delete the assignment of the LAST/only pentester for a one-pentester project, then open the Planner/board.
- **Expected:** The project's card is **gone** from the board entirely — not present, not in 'Stopped', not orphaned/hung. The project and its comments/files/checklist are deleted. The board reflects the removal without a manual reload.
- **Result:** pass

### P01-T02: Multi-pentester project still untouched (regression)

- **Plan:** 09-01 (remediated)
- **Scenario:** In the Schedule, delete ONE pentester's assignment for a project with TWO+ pentesters (leaving at least one), then open the Planner/board.
- **Expected:** The project's card is unchanged — still present, same stage, NOT deleted; only the removed pentester's avatar disappears. Deletion fires ONLY when zero assignments remain.
- **Result:** pass
