---
phase: 1
round: 3
plan_count: 1
status: complete
started: 2026-07-08
total_tests: 2
passed: 2
skipped: 0
issues: 0
completed: 2026-07-08
---

UAT remediation round 03 re-verification — Phase 01 client dropdowns. Re-tests: UAT-3 ("No client" present when not searching — after hard refresh), UAT-4 (down-chevron caret on trigger), UAT-5 (trigger/sentinel text normal color, not disabled-looking). **Hard-refresh / rebuild the frontend before testing.**

## Tests

### R3-T01 — Assignment client picker: caret + normal text + "No client" present
- **Scenario:** After a hard refresh, open the Schedule assignment client picker; look at the trigger and open the list (empty search), then type.
- **Expected:** The trigger shows a down-chevron caret and its text is normal-colored (not greyed/disabled). With empty search, "No client" is shown at the top; typing hides it; clearing brings it back. Sort/search/swatches still work.
- **Result:** pass

### R3-T02 — Board "All clients" filter: caret + normal text + kept sentinel
- **Scenario:** After a hard refresh, look at the board "All clients" filter trigger and open it (empty search), then type.
- **Expected:** Trigger shows the caret and normal-colored text. "All clients" is kept, shown when search is empty and hidden while typing; filtering still works.
- **Result:** pass
