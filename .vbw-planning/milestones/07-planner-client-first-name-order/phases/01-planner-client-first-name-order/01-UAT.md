---
phase: 1
plan_count: 1
status: complete
started: 2026-08-31
completed: 2026-08-31
total_tests: 5
passed: 5
skipped: 0
issues: 0
---

Human acceptance testing for Phase 01 — Planner client-first name order on the Kanban card and the card detail modal.

Checkpoint IDs P01-T01..P01-T05 correspond to the replay script's T01..T05. Checkpoints were replayed through `ui-seed/uat_replay_09.py` (Selenium, logged in as `pm`, non-destructive), with screenshots in `ui-seed/uat-screenshots/`. The user watched the replay and reported verdicts.

## Tests

### P01-T01: Planner card reads client-first with the emphasis swapped

- **Plan:** 01 -- Planner Client-First Name Order (card + detail modal)
- **Scenario:** Open the Planner at `/board` and read any card that has both a client and a project.
- **Expected:** Line 1 is the CLIENT name in the large headline style (`text-lg font-semibold`); line 2 is the PROJECT name in the smaller bold style (`text-sm font-bold`) — the reverse of what shipped previously. The client name renders as plain readable foreground text with no brand-colour tint, and the coloured accent bar on the card's left edge is unchanged.
- **Result:** pass

### P01-T02: Clientless card falls back to the project name as its headline

- **Plan:** 01 -- Planner Client-First Name Order (card + detail modal)
- **Scenario:** Look at a card whose project has no linked client (`Project.clientId` is nullable — deleting a Client nulls it via `onDelete: SetNull`).
- **Expected:** The first line shows the PROJECT name in the large headline style — never blank, never a collapsed layout — and that name appears exactly once on the card rather than being repeated on a second line.
- **Result:** pass

### P01-T03: Card detail modal header leads with the client, project beneath

- **Plan:** 01 -- Planner Client-First Name Order (card + detail modal)
- **Scenario:** Click a Planner card to open its detail modal and read the header region.
- **Expected:** The modal title is the CLIENT name, with the PROJECT name directly beneath it in a smaller bold line. The client name is NOT repeated in the grey meta row further down — that row now shows tags only, or is absent when there are none. Tags, status badge, notes, files and comments are unaffected.
- **Result:** pass

### P01-T04: Pin indicator travels with the new first row

- **Plan:** 01 -- Planner Client-First Name Order (card + detail modal)
- **Scenario:** Find a manually-placed (pinned) card on the board and check where its pin icon sits.
- **Expected:** The pin is top-right on the FIRST row, level with the client name — it moved with the headline rather than being orphaned beside the project name on the second line.
- **Result:** pass

### P01-T05: Out-of-scope surfaces undisturbed

- **Plan:** 01 -- Planner Client-First Name Order (card + detail modal)
- **Scenario:** Visit the Schedule grid and the Dashboard and compare them against their previous appearance.
- **Expected:** Schedule grid cells still read `Client - Project` exactly as before (they were already client-first and were deliberately not touched), and the dashboard project cards are unchanged with the project name above the client — that surface was explicitly left out of scope for this phase.
- **Result:** pass
