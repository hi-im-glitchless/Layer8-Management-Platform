---
phase: 2
plan_count: 1
status: complete
started: 2026-07-02
completed: 2026-07-02
total_tests: 3
passed: 3
skipped: 0
issues: 0
---

UAT for the Out Today Dashboard widget — human visual/behavior sign-off.

## Tests

### P01-T01: "Out Today" section appears on the Dashboard

- **Plan:** 02-01 -- Out-Today Dashboard Widget
- **Scenario:** Open the app and go to the Dashboard (route `/`). Look below the "Your Schedule" section.
- **Expected:** A new "Out Today" section is visible below "Your Schedule", with a heading (icon + "Out Today" title) styled consistently with the other dashboard section headings.
- **Result:** pass

### P01-T02: Absence list / empty state renders correctly

- **Plan:** 02-01 -- Out-Today Dashboard Widget
- **Scenario:** Observe the "Out Today" widget content. If people are absent today, review the list; if no one is out, review the empty state. (If you can seed/have an absence for today, confirm that person appears.)
- **Expected:** When people are out, each absentee shows their name, a readable type label (Holiday/Sick/Vacation/Other), and a reason when present. When no one is out, it shows the "No one is out today" empty-state card. The data shown matches who is actually absent today.
- **Result:** pass

### P01-T03: Styling and no regressions to existing dashboard content

- **Plan:** 02-01 -- Out-Today Dashboard Widget
- **Scenario:** Scan the whole Dashboard with the new widget present. Check the widget's card/spacing against the rest of the dashboard, and confirm the existing sections (Your Schedule, project cards) still render correctly.
- **Expected:** The Out Today widget matches the dashboard's card/spacing look, and no existing dashboard content is broken, shifted, or missing.
- **Result:** pass

## Summary

- Passed: 0
- Skipped: 0
- Issues: 0
- Total: 3
