---
phase: 8
plan_count: 1
status: complete
started: 2026-06-11
completed: 2026-06-11
total_tests: 2
passed: 2
skipped: 0
issues: 0
---

UAT for Phase 08 — planner/board card avatars now derive the name + initials from
the account's full `user.displayName` instead of the editable TeamMember alias, so
a pentester with a first and last name shows two initials (e.g. "Rui Marques" →
"RM") instead of one. Planner-only; the Schedule is unchanged. A Selenium replay
that parks you on the board and reads each avatar's monogram is at
`ui-seed/uat_replay_08.py` (run `cd ui-seed && E2E_HEADLESS=0 python3 uat_replay_08.py`).

## Tests

### P01-T01: Full-name accounts show two initials on the planner

- **Plan:** 08-01 -- Name precedence flip
- **Scenario:** Open the planner / board. Look at a card whose assigned pentester has an account with a first AND last name (e.g. "Rui Marques", username `rmarques`).
- **Expected:** The avatar circle now shows a **two-letter monogram** of the first + last initial (e.g. "RM") — not the single letter it showed before. Hovering the avatar shows the full name. The background colour is unchanged from before (still per-account).
- **Result:** pass

### P01-T02: Backlog members & single-name accounts unchanged (no regression)

- **Plan:** 08-01 -- Name precedence flip
- **Scenario:** Look at a backlog member with no login account (e.g. "Futuro 1"), and any genuinely single-name account, plus a multi-pentester card.
- **Expected:** Backlog members still render from their alias as before (e.g. "Futuro 1" → "F1"); a truly single-word name still shows one initial; per-account colours are stable; cards still cap at 3 circles with a "+N" overflow and dedupe by team member. The Schedule view looks exactly as it did before this phase.
- **Result:** pass
