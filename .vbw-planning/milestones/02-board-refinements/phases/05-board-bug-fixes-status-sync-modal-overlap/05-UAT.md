---
phase: 5
plan_count: 2
status: complete
started: 2026-06-04
completed: 2026-06-05
total_tests: 2
passed: 2
skipped: 0
issues: 0
---

UAT for two board bug fixes. Verify on the running app with demo data seeded. A Selenium replay that parks you on the relevant screens is at `ui-seed/uat_replay_05.py` (run `cd ui-seed && E2E_HEADLESS=0 python3 uat_replay_05.py`). Note: bug 1 (status sync) needs two views open / a refresh-free check — see the scenario.

## Tests

### P01-T01: Schedule status edit propagates to the board automatically

- **Plan:** 05-01 -- Status sync
- **Scenario:** Note a project's status as shown on its board (planner) card. Then, on the Schedule, edit that same project's status to a different value and save. Return to / look at the board WITHOUT manually refreshing the page.
- **Expected:** The board card's status badge updates to the new status automatically (no manual page refresh needed). Before this fix, the board kept showing the old status.
- **Result:** pass

### P02-T01: Card modal close (✕) and "manually placed" pin no longer overlap

- **Plan:** 05-02 -- Card detail modal overlap
- **Scenario:** Open the detail modal for a card that is "manually placed" (so the pin icon shows in the title row — e.g. a card you manually dragged into a stage). Look at the top-right corner of the modal.
- **Expected:** The close (✕) button and the "manually placed" pin icon are both fully visible and do not overlap — the pin sits to the left of the ✕, both clickable.
- **Result:** pass
