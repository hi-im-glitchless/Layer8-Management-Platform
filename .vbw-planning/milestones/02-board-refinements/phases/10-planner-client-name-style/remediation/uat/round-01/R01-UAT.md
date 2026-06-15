---
phase: 10
plan_count: 1
status: complete
started: 2026-06-15
completed: 2026-06-15
total_tests: 1
passed: 1
skipped: 0
issues: 0
round: 1
verify_scope: remediation
---

UAT re-verification (round 01) for Phase 10 after the remediation fix: the planner
card client-name font size was increased one step (`text-xs` → `text-sm`), keeping
bold weight, the client colour, and the legibility guard. Replay: `ui-seed/uat_replay_10.py`.

## Tests

### P01-T01: Client name is larger (text-sm), still bold + client colour + readable

- **Plan:** 10-01 (remediated)
- **Scenario:** Open the planner/board; look at the client-name line on the cards.
- **Expected:** The client name is now visibly **larger** than before (one step up), and remains **bold**, in the **client's colour**, and readable (pale colours still fall back to a dark, legible colour). The project name, avatars, and Schedule are unchanged.
- **Result:** pass
