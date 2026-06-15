---
phase: 9
plan_count: 1
status: issues_found
started: 2026-06-12
completed: 2026-06-12
total_tests: 2
passed: 1
skipped: 0
issues: 1
---

UAT for Phase 09 — deleting the last pentester's assignment for a project in the
Schedule no longer orphans the project card in the Planner; the card moves to the
existing **'Stopped'** column (never deleted) and the board refreshes immediately.
A project still assigned to other pentesters is left untouched. A Selenium replay
that parks you on the Schedule/Board and reads card stages is at
`ui-seed/uat_replay_09.py` (run `cd ui-seed && E2E_HEADLESS=0 python3 uat_replay_09.py`).

## Tests

### P01-T01: Last-pentester schedule delete moves the card to 'Stopped'

- **Plan:** 09-01 -- Last-assignment 'stopped' guard + board refresh
- **Scenario:** In the Schedule, find a project assigned to exactly ONE pentester. Delete that (last) assignment. Switch to the Planner/board.
- **Expected:** The project's card is still on the board (not removed, not blank/"hung") and now sits in the **'Stopped'** column. The board updates without a manual reload. Opening the card shows its notes/files/checklist preserved — nothing was deleted.
- **Result:** issues_found — The implemented behavior (move the orphaned card to 'Stopped') is not what's wanted. User decision: when the deleted assignment is the **last** one for the project (zero remaining assignments), the card should be **DELETED**, not moved to 'Stopped'. The "hung up" symptom is gone (board refreshes correctly), but the disposition is wrong. **Resolution (user-confirmed): FULL DELETE** — on zero remaining assignments, hard-delete the `Project`, cascade-removing its `BoardCard` and all comments/files/checklist/notes (not recoverable). Keep it best-effort/non-fatal and keep the board cache-invalidation + socket broadcast so the board refreshes after the card is gone. Multi-pentester safety (P01-T02, PASS) is unchanged and must still hold — deletion fires ONLY when the post-delete remaining-assignment count (union of projectId/splitProjectId) is exactly 0.

### P01-T02: Multi-pentester project is untouched when one assignment is deleted

- **Plan:** 09-01 -- Last-assignment 'stopped' guard + board refresh
- **Scenario:** In the Schedule, find a project assigned to TWO or more pentesters. Delete ONE pentester's assignment (leaving at least one remaining). Switch to the Planner/board.
- **Expected:** The project's card is **unchanged** — same column/stage as before, still present, NOT moved to 'Stopped' and NOT deleted. Only the removed pentester's avatar disappears from the card. No data loss.
- **Result:** pass
