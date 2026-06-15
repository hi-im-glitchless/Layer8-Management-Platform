---
phase: 11
plan_count: 1
status: complete
started: 2026-06-16
completed: 2026-06-16
total_tests: 2
passed: 2
skipped: 0
issues: 0
---

UAT for Phase 11 — the board "Show Archived" toggle is now visible to the **PM**
role (was ADMIN-only), so project managers can see and open archived cards
(read access). The archive **action** stays ADMIN-only on every path: the
Archive button is hidden for PM, and the drag-to-archive `PATCH /cards/:id`
hole is closed server-side (`stage='archived'` → 403 for non-ADMIN). A Selenium
replay that drives the board as PM then ADMIN is at `ui-seed/uat_replay_11.py`
(run `cd ui-seed && E2E_HEADLESS=0 python3 uat_replay_11.py`).

## Tests

### P01-T01: PM sees the Show-Archived toggle and can open an archived card

- **Plan:** 11-01 -- Show-archived toggle visible to PM
- **Scenario:** Log in as a PM. Open the board. Confirm the "Show Archived" toggle is visible, enable it, and click an archived card.
- **Expected:** The toggle IS visible to PM; enabling it reveals archived cards; clicking an archived card opens its detail (read access). NORMAL users still do not see the toggle.
- **Result:** pass

### P01-T02: Archive stays ADMIN-only (button hidden for PM; drag-to-archive blocked)

- **Plan:** 11-01 -- Block PM from archiving via PATCH stage (ADMIN-only)
- **Scenario:** As PM, open a card detail and look for an Archive action. Then log in as ADMIN and confirm both the toggle and the Archive button are present.
- **Expected:** PM has NO Archive button on a card detail, and a PM drag-to-archive PATCH is rejected (403). ADMIN still sees the Show-Archived toggle AND the Archive button, and can archive.
- **Result:** pass
