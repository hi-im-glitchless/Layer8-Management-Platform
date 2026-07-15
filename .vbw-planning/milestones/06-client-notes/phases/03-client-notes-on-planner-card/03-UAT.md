---
phase: 3
plan_count: 3
status: complete
started: 2026-07-15
completed: 2026-07-15
total_tests: 3
passed: 3
skipped: 0
issues: 0
---

Human acceptance testing for Phase 03 — Read-Only Client Notes on the Planner Card (client notes surfaced above project notes in the card detail modal, read-only for all roles).

## Tests

### P01-T01: Client notes render above project notes as read-only markdown

- **Plan:** 01 -- Read-Only Client Notes on the Planner Card
- **Scenario:** Open the Board and open the detail modal of a card whose project belongs to a client that has notes (set some client notes via Tools > Client Notes first if needed, e.g. with a bit of markdown like **bold** or a list). Look at the card detail modal.
- **Expected:** A "Client Notes" section appears ABOVE the project's own Notes editor, showing the client's notes rendered as formatted markdown. The section is read-only — there is no Edit/Preview tab, no textarea, and no Save/Cancel button anywhere in it. The project Notes editor below it still works as before.
- **Result:** pass

### P01-T02: Client notes stay read-only even for an Admin

- **Plan:** 01 -- Read-Only Client Notes on the Planner Card
- **Scenario:** Log in as an ADMIN and open the same card detail modal (a card whose project's client has notes).
- **Expected:** The "Client Notes" section is still strictly read-only for Admin too — no edit affordance appears (no textarea, no Edit/Preview tabs, no Save/Cancel). Admins can edit client notes on the dedicated Client Notes page, but never inline on the planner card.
- **Result:** pass

### P01-T03: No client / empty notes shows no section, and the tile is unchanged

- **Plan:** 01 -- Read-Only Client Notes on the Planner Card
- **Scenario:** Open the detail modal of (a) a card whose project has no client, and (b) a card whose project's client has empty/blank notes. Also glance at the Kanban tiles on the board.
- **Expected:** In both (a) and (b) no "Client Notes" section and no stray "Client Notes" heading appears — the modal looks exactly as it did before this feature. The Kanban tiles themselves look identical regardless of whether a client has notes (client notes only appear inside the opened card detail modal, never on the tile).
- **Result:** pass

## Summary

- Passed: 0
- Skipped: 0
- Issues: 0
- Total: 3
