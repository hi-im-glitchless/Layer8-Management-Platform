# Shipped: Project Board

**Milestone:** Project Board ("Planner")
**Slug:** 01-project-board
**Shipped:** 2026-06-03
**Tag:** milestone/project-board

## Scope

Kanban board for pentest projects with files/notes/comments and full schedule
integration. Comprises phases 22–24 (phase 21, the board data model & API,
shipped earlier as prior work).

## Phases

| Phase | Name | QA | UAT |
|-------|------|----|-----|
| 22 | Project Board — Kanban UI | PASS (remediation R02-VERIFICATION) | complete (6/6) |
| 23 | Project Board — Files, Notes & Comments | PASS (remediation R01-VERIFICATION) | complete (7/7) |
| 24 | Project Board — Schedule Integration & Navigation | PASS (remediation R01-VERIFICATION) | complete (6/6) |

## Verification summary

- All three phases passed QA (round-scoped `R{RR}-VERIFICATION.md` PASS after
  remediation) and UAT (`{NN}-UAT.md` status: complete, 0 issues).
- Phase 23 QA remediation: corrected an undeclared archive-validation deviation
  (project-model JSDoc + declaration) — commits 1ca7799, 1d15988.
- Phase 24 QA remediation: fixed schedule-isolation test concurrency (scoped
  snapshot + restored the deleted phase-24 isolation test; both suites 8/8
  concurrent) — commits 24554f6, 2941b3d, 7446145.
- Phase 24 UAT inline fix: pointer cursor on a pentester's own navigable
  schedule cell — commit b603ce9.

## Known follow-ups (non-blocking, carried forward)

- ArchiveCardDialog empty-projectName UX edge case (card with no linked project →
  empty typed-confirmation target). Recommend disabling Archive when no project,
  or a literal "DELETE" sentinel. (Phase 23 UAT R01, P05-T2.)
- Creating a Schedule assignment does not live-invalidate an already-open Board
  view (the auto-created card appears after a reload). Consider emitting a board
  'cards' invalidation from the assignment auto-create path.
- SQLite single-writer can time out under heavy concurrent assignment writes
  (surfaced in test harness; mitigated test-side with a retry helper). Revisit at
  the product level if the deployment DB or concurrency profile changes.

## Notes

ROADMAP.md was trimmed to this milestone's scope (phases 22–24) at archive time;
phases 1–21 are earlier completed project work preserved in git history and the
ROADMAP "Prior Work" appendix (their phase directories were cleaned during
development; 01–03 live in `.vbw-planning/gsd-archive/`).
