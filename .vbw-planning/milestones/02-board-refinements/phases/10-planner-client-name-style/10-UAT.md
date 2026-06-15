---
phase: 10
plan_count: 1
status: issues_found
started: 2026-06-15
completed: 2026-06-15
total_tests: 2
passed: 1
skipped: 0
issues: 1
---

UAT for Phase 10 — the planner/board card preview now renders the **client name**
in bold and in the **client's own colour**, with a legibility guard so pale client
colours stay readable on the white card. Frontend-only; the Schedule is unchanged.
A Selenium replay that reads each card's client-name styling is at
`ui-seed/uat_replay_10.py` (run `cd ui-seed && E2E_HEADLESS=0 python3 uat_replay_10.py`).

## Tests

### P01-T01: Client name is bold and in the client's colour

- **Plan:** 10-01 -- Client name bold + client colour
- **Scenario:** Open the planner/board. Look at the client-name line (under the project name) on the cards.
- **Expected:** The client name is **bold** and rendered in that **client's colour**. Two cards belonging to different clients show their names in different colours; the colour matches the client's colour as shown elsewhere (client admin / schedule legend).
- **Result:** issues_found — Bold + client colour is correct and accepted. **Follow-up requested:** increase the client-name font size on the card preview (currently `text-xs`). Bump it up one step (e.g. `text-xs` → `text-sm`) while keeping bold + client colour + the legibility guard. Target size to confirm with user during remediation.

### P01-T02: Pale client colours stay readable; Schedule unchanged

- **Plan:** 10-01 -- Client name bold + client colour
- **Scenario:** Find a client whose colour is very pale/near-white (and any client with no colour set). Look at its card. Then glance at the Schedule.
- **Expected:** The pale-client name is still clearly **readable** on the white card (the guard renders a dark colour instead of a washed-out hex) — not invisible. A client with no colour renders its name safely (no blank/broken text). The Schedule view looks exactly as before this phase.
- **Result:** pass
