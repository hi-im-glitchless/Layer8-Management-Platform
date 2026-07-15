---
phase: 1
round: 2
plan_count: 1
status: issues_found
started: 2026-07-08
total_tests: 2
passed: 0
skipped: 0
issues: 2
completed: 2026-07-08
---

UAT remediation round 02 re-verification — Phase 01 client dropdowns. Re-tests the corrected fixes: UAT-2b (trigger-button hover matches pentesters dropdown) and UAT-1b (sentinel shown always, hidden only while searching).

## Tests

### R2-T01 — Assignment client picker: trigger hover + sentinel-while-searching
- **Scenario:** In the Schedule assignment modal, hover over the client dropdown trigger (before opening), then open it and type in the search box.
- **Expected:** Hovering the trigger no longer shows the weird fill (matches the pentesters dropdown). With the search box empty, "No client" is shown at the top; as soon as you type search text, "No client" disappears (only matching clients show); clearing the text brings it back. Sort/search/swatches still work.
- **Result:** issues_found
- **Note:** Trigger hover fill is now correct (good).
- **Issues:**
  - **UAT-3 (minor):** In the planner/assignment picker, "No client" is now MISSING entirely (it should show when the search box is empty per the `!search` rule). Regression from the round-02 sentinel change — investigate why it no longer renders.
  - **UAT-4 (minor):** The dropdown trigger has no caret/down-chevron indicator; the pentesters `SelectTrigger` shows a ChevronDown. Add one so it reads as a dropdown.
  - **UAT-5 (minor):** The trigger font color is different (looks disabled/greyed-out) vs the pentesters dropdown. Make the trigger text use normal foreground color to match `SelectTrigger`.

### R2-T02 — Board "All clients" filter: trigger hover + sentinel-while-searching
- **Scenario:** On the Board, hover the "All clients" filter trigger, open it, and type in the search box.
- **Expected:** Trigger hover no longer weird (matches pentesters dropdown). "All clients" is shown when the search box is empty and hides while there is search text; clearing restores it. Selecting/clearing still filters the board.
- **Result:** issues_found
- **Issues:**
  - **UAT-6 (DROPPED — user decided to keep "All clients"):** On reflection the user chose to keep the "All clients" row as the filter reset. No change to board sentinel. The board trigger still shares the caret (UAT-4) + font-color (UAT-5) fixes.
