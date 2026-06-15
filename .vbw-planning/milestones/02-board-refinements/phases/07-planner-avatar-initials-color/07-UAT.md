---
phase: 7
plan_count: 1
status: complete
started: 2026-06-11
completed: 2026-06-11
total_tests: 5
passed: 5
skipped: 0
issues: 0
---

UAT for Phase 07 — Planner card avatars now show a two-initial monogram on an
account-derived colour (planner/board only; Schedule unchanged). Verify on the
running app with demo data seeded. A Selenium replay that parks you on the board
and reads the avatars is at `ui-seed/uat_replay_07.py`
(run `cd ui-seed && E2E_HEADLESS=0 python3 uat_replay_07.py`). The two `D` entries
are documented-deviation reviews (a commit-boundary nuance already reconciled in
QA) — accept them as non-blocking unless you disagree.

## Tests

### D01: Deviation review — DEVN-01 (commit boundary)

- **Source:** Summary deviation review
- **Deviation Signature:** 33ac1bc42482a341fe2c14bb24afff2c7a6ffc0ef758ef998eede48c818c7a5d
- **Source Plan:** 01
- **Source Summary:** 07-01-SUMMARY.md
- **Deviation:** DEVN-01 (minor, inline, not escalated): Task-1 boundary kept tsc green by applying the avatarBgColor inline style on AvatarFallback within the Task-1 commit (the plan permitted either inlining the rename at the callsite or keeping the change self-consistent). Without consuming avatarBgColor, TS strict noUnusedLocals failed it as a declared-but-unused symbol. Task 2 then dropped the AvatarImage/avatarUrl photo branch + import and simplified the memo comparator as planned. No scope change.
- **Expected:** Human confirms whether this documented deviation is acceptable for this phase.
- **Result:** pass

### D02: Deviation review — DEVN-01 (restated)

- **Source:** Summary deviation review
- **Deviation Signature:** 4497decd01f3e846bb8deb499bd18fd048169ecfd41cf673ded1ed26a709992b
- **Source Plan:** 01
- **Source Summary:** 07-01-SUMMARY.md
- **Deviation:** DEVN-01 (minor, inline): The Task-1 commit applied the `avatarBgColor` inline style on `AvatarFallback` so the file kept `tsc -b` green at the task boundary (TS strict `noUnusedLocals` would otherwise reject the unused helper). The plan explicitly allowed keeping the Task-1 change self-consistent; the photo-branch removal, import trim, and memo simplification still landed in Task 2 as planned. No scope change. No pre-existing failures encountered.
- **Expected:** Human confirms whether this documented deviation is acceptable for this phase.
- **Result:** pass

### P01-T01: Board avatars are two-initial monograms on an account colour (not photos)

- **Plan:** 07-01 -- Planner card avatars
- **Scenario:** Open the planner / board (Kanban) with demo data seeded. Look at the pentester avatar circles on the cards.
- **Expected:** Each circle shows a 1-2 letter monogram — first initial of the first name + first initial of the last name, uppercase (a single-name account shows one letter) — on a coloured circle. No photos, no single grey letters. White text is legible on every colour.
- **Result:** pass

### P01-T02: Colour is stable per account, and the Schedule is unchanged

- **Plan:** 07-01 -- Planner card avatars
- **Scenario:** Note a person's circle colour on the board, navigate away and back (or reload). Then open the Schedule and look at the same person's avatar.
- **Expected:** The same account always gets the same circle colour on the board (colour is tied to the account, not the name). On the Schedule, avatars look exactly as they did before this phase — only the planner/board changed.
- **Result:** pass

### P01-T03: Multi-pentester cards still dedupe and cap at 3 with "+N"

- **Plan:** 07-01 -- Planner card avatars
- **Scenario:** Find a card with several assigned pentesters (including anyone with both a primary and a split assignment).
- **Expected:** At most 3 circles show, followed by a "+N" overflow chip; the same person is never shown twice. Behaviour matches the previous avatar version — only the look (initials + colour) changed.
- **Result:** pass
