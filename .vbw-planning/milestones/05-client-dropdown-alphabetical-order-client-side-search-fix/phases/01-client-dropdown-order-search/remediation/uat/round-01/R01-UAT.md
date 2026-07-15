---
phase: 1
round: 1
plan_count: 1
status: issues_found
started: 2026-07-08
total_tests: 2
passed: 0
skipped: 0
issues: 2
completed: 2026-07-08
---

UAT remediation round 01 re-verification — Phase 01 client dropdowns. Re-tests the two minor issues fixed this round (UAT-1 clear-only "No client"; UAT-2 hover styling). P01-T03 (selection/save/filter) passed originally and is unaffected.

## Tests

### R1-T01 — Assignment client picker: "No client" is clear-only + hover fixed
- **Scenario:** In the Schedule assignment modal, open the client picker with NO client selected, then select a client and open it again.
- **Expected (UAT-1):** With nothing selected, "No client" is NOT shown. Once a client IS selected, "No client" appears (so you can clear back to none). **(UAT-2):** Hovering items no longer shows the weird highlight — it matches the pentesters dropdown styling. Sorting + search still work; swatches still show.
- **Result:** issues_found
- **Issues:**
  - **UAT-1b (minor, corrected spec):** The clear-only interpretation is wrong. The "No client" option should appear **always**, and be **hidden ONLY while there is search text in the box** (so it doesn't clutter results while typing a client name). Not "only when a value is selected".

### R1-T02 — Board "All clients" filter: sentinel intact + hover fixed
- **Scenario:** On the Board, open the "All clients" client filter.
- **Expected:** "All clients" is still always shown at the top (NOT hidden — it's the default no-filter). Hover styling is fixed (matches pentesters dropdown). Sort + search still work; selecting/clearing still filters the board.
- **Result:** issues_found
- **Issues:**
  - **UAT-2b (minor):** The hover/highlight on the client combobox items still looks wrong vs the pentesters dropdown (details captured below for the next fix round).
