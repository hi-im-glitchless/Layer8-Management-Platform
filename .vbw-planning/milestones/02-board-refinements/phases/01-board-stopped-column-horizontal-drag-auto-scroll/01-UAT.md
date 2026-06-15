---
phase: 1
plan_count: 2
status: issues_found
started: 2026-06-03
completed: 2026-06-03
total_tests: 5
passed: 4
skipped: 0
issues: 1
---

UAT for the "Stopped" board column (first in display order, manual-only, never auto-moved) and horizontal-only drag auto-scroll. Verify on the running app at /board with demo data seeded.

## Tests

### P01-T01: "Stopped" column appears first

- **Plan:** 01-01 -- Stopped Column & Horizontal Drag Auto-Scroll
- **Scenario:** Open the app and go to the Board (/board). Look at the column headers left-to-right.
- **Expected:** A column labeled "Stopped" is the FIRST (leftmost) column, before "Upcoming" — order: Stopped → Upcoming → Preparation → Execution → Closing → Done. It is always visible (not behind a toggle like Archived).
- **Result:** pass
### P01-T02: Drag a card into Stopped and it persists

- **Plan:** 01-01 -- Stopped Column & Horizontal Drag Auto-Scroll
- **Scenario:** Drag any card from its current column into the "Stopped" column, then reload the page.
- **Expected:** The card moves into Stopped, and after reload it is still in Stopped (the change persisted to the backend; no error).
- **Result:** pass

### P01-T03: A Stopped card is never auto-moved

- **Plan:** 01-01 -- Stopped Column & Horizontal Drag Auto-Scroll
- **Scenario:** Leave a card in "Stopped" — ideally one whose project dates would normally make the date-based auto-mover promote it to Preparation/Execution. Reload / revisit the board.
- **Expected:** The Stopped card stays in Stopped; the automatic date-based mover never pulls it out into Upcoming/Preparation/Execution. (Only a manual drag moves it out.)
- **Result:** pass

### P01-T04: Horizontal auto-scroll while dragging near the edge

- **Plan:** 01-01 -- Stopped Column & Horizontal Drag Auto-Scroll
- **Scenario:** Make the board wide enough that some columns are off-screen (narrow the window if needed). Start dragging a card and move the pointer toward the right (or left) edge of the board area and hold it there.
- **Expected:** The board auto-scrolls horizontally so off-screen columns come into view, letting you drop on a column that wasn't initially visible. Scrolling is horizontal only — dragging near the top/bottom does NOT auto-scroll vertically.
- **Result:** pass

### P01-T05: Normal (non-drag) horizontal scroll still works

- **Plan:** 01-01 -- Stopped Column & Horizontal Drag Auto-Scroll
- **Scenario:** Without dragging any card, scroll the board horizontally using the trackpad/mouse wheel/scrollbar.
- **Expected:** The board scrolls horizontally as normal — the auto-scroll change did not break ordinary scrolling.
- **Result:** issue
- **Issue:**
  - Description: On a laptop trackpad, a two-finger gesture cannot scroll vertically while on the Board. The user reports vertical (two-finger) scrolling does not work. Likely the Board's horizontal scroll container (`div.overflow-x-auto` wrapping the columns) and/or the DndContext autoScroll setup is capturing/blocking the trackpad's vertical scroll gesture, so the page/board no longer scrolls vertically via two fingers. Scope (Board-only vs whole app) and exact cause to be confirmed in remediation; horizontal scroll itself was not separately confirmed.
  - Severity: major
